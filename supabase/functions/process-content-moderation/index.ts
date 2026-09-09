import { requireAutomationSecret } from "../_shared/automation.ts";
import { HttpError, json, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

type Verdict = "allow" | "block" | "review";
type ProviderResult = { verdict?: Verdict; categories?: string[]; confidence?: number; providerRef?: string };

const moderationProvider = async (payload: Record<string, unknown>): Promise<Required<Pick<ProviderResult, "verdict" | "categories" | "confidence">> & { providerRef?: string }> => {
  const endpoint = Deno.env.get("CONTENT_MODERATION_URL");
  const token = Deno.env.get("CONTENT_MODERATION_TOKEN");
  if (!endpoint || !token) throw new HttpError(503, "Content moderation is not configured.", "moderation_unavailable");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Moderation provider request failed.");
  const result = await response.json() as ProviderResult;
  if (!result.verdict || !["allow", "block", "review"].includes(result.verdict)) throw new Error("Moderation provider returned an invalid verdict.");
  const confidence = Number(result.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Moderation provider returned invalid confidence.");
  const categories = Array.isArray(result.categories) ? result.categories.map(String).slice(0, 20) : [];
  return { verdict: result.verdict, categories, confidence, providerRef: result.providerRef?.slice(0, 200) };
};

Deno.serve(async (request) => {
  try {
    requireMethod(request, "POST");
    await requireAutomationSecret(
      request,
      "MODERATION_AUTOMATION_SECRET",
      "x-equina-cron-secret",
    );

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: jobs, error } = await admin.rpc("claim_content_moderation_jobs", {
      batch_size: 20,
      lease_seconds: 300,
    });
    if (error) throw error;
    const summary = { processed: 0, approved: 0, rejected: 0, manualReview: 0, failed: 0 };

    for (const job of jobs ?? []) {
      summary.processed += 1;

      try {
        let payload: Record<string, unknown>;
        if (job.target_type === "club_post") {
          const { data: post, error: postError } = await admin.from("club_posts").select("id,body,post_type").eq("id", job.target_id).maybeSingle();
          if (postError) throw postError;
          if (!post) {
            await admin.from("content_moderation_jobs").update({
              status: "approved", completed_at: now, result: { deleted: true },
              lease_token: null, lease_expires_at: null,
            }).eq("id", job.id).eq("lease_token", job.lease_token);
            continue;
          }
          const { data: media, error: mediaError } = await admin.from("club_post_media").select("object_path,mime_type").eq("post_id", post.id).order("position");
          if (mediaError) throw mediaError;
          const mediaPayload = await Promise.all((media ?? []).map(async (item) => {
            const { data: signed, error: signedError } = await admin.storage.from("club-media").createSignedUrl(item.object_path, 300);
            if (signedError || !signed?.signedUrl) throw signedError ?? new Error("Club media could not be signed.");
            return { url: signed.signedUrl, mimeType: item.mime_type };
          }));
          payload = { target: "club_post", text: post.body, postType: post.post_type, media: mediaPayload };
        } else if (job.target_type === "club_comment") {
          const { data: comment, error: commentError } = await admin.from("club_comments").select("id,body").eq("id", job.target_id).maybeSingle();
          if (commentError) throw commentError;
          if (!comment) {
            await admin.from("content_moderation_jobs").update({
              status: "approved", completed_at: now, result: { deleted: true },
              lease_token: null, lease_expires_at: null,
            }).eq("id", job.id).eq("lease_token", job.lease_token);
            continue;
          }
          payload = { target: "club_comment", text: comment.body, media: [] };
        } else {
          const { data: listing, error: listingError } = await admin.from("listings")
            .select("id,title,description,category,brand_name,condition_grade,metadata,status").eq("id", job.target_id).maybeSingle();
          if (listingError) throw listingError;
          if (!listing || listing.status !== "pending_review") {
            await admin.from("content_moderation_jobs").update({
              status: "approved", completed_at: now, result: { inactive: true },
              lease_token: null, lease_expires_at: null,
            }).eq("id", job.id).eq("lease_token", job.lease_token);
            continue;
          }
          const { data: photos, error: photosError } = await admin.from("listing_photos").select("object_path,mime_type,required_angle").eq("listing_id", listing.id).order("position");
          if (photosError) throw photosError;
          const photoPayload = await Promise.all((photos ?? []).map(async (photo) => {
            const { data: signed, error: signedError } = await admin.storage.from("listing-media").createSignedUrl(photo.object_path, 300);
            if (signedError || !signed?.signedUrl) throw signedError ?? new Error("Listing media could not be signed.");
            return { url: signed.signedUrl, mimeType: photo.mime_type, angle: photo.required_angle };
          }));
          payload = {
            target: "listing", text: `${listing.title}\n${listing.description}`,
            category: listing.category, brand: listing.brand_name, condition: listing.condition_grade,
            safetyDeclarations: {
              impactHistory: Boolean((listing.metadata as Record<string, unknown> | null)?.impact_history),
              proofOfOwnership: Boolean((listing.metadata as Record<string, unknown> | null)?.proof_of_ownership),
            },
            media: photoPayload,
          };
        }

        const result = await moderationProvider(payload);
        const resultPayload = { categories: result.categories, confidence: result.confidence };
        if (job.target_type === "club_post") {
          const status = result.verdict === "allow" ? "visible" : result.verdict === "block" ? "hidden" : "pending";
          const { error: updateError } = await admin.from("club_posts").update({ moderation_status: status }).eq("id", job.target_id);
          if (updateError) throw updateError;
        } else if (job.target_type === "club_comment") {
          const status = result.verdict === "allow" ? "visible" : result.verdict === "block" ? "hidden" : "pending";
          const { error: updateError } = await admin.from("club_comments").update({ moderation_status: status }).eq("id", job.target_id);
          if (updateError) throw updateError;
        } else if (result.verdict === "allow") {
          const { count, error: riskError } = await admin.from("listing_risk_signals").select("id", { count: "exact", head: true })
            .eq("listing_id", job.target_id).eq("severity", "high").is("resolved_at", null);
          if (riskError) throw riskError;
          if ((count ?? 0) === 0) {
            const { error: updateError } = await admin.from("listings").update({ status: "active", published_at: now, moderation_note: null }).eq("id", job.target_id).eq("status", "pending_review");
            if (updateError) throw updateError;
          } else {
            result.verdict = "review";
          }
        } else if (result.verdict === "block") {
          const { error: updateError } = await admin.from("listings").update({ status: "rejected", moderation_note: "Listing content did not pass safety review." }).eq("id", job.target_id);
          if (updateError) throw updateError;
        }

        const jobStatus = result.verdict === "allow" ? "approved" : result.verdict === "block" ? "rejected" : "manual_review";
        const { error: completeError } = await admin.from("content_moderation_jobs").update({
          status: jobStatus, provider_ref: result.providerRef ?? null, result: resultPayload,
          completed_at: now, last_error: null, lease_token: null, lease_expires_at: null,
        }).eq("id", job.id).eq("lease_token", job.lease_token);
        if (completeError) throw completeError;
        if (jobStatus === "approved") summary.approved += 1;
        else if (jobStatus === "rejected") summary.rejected += 1;
        else summary.manualReview += 1;
      } catch {
        const attempts = job.attempts;
        const retryMinutes = Math.min(1440, 2 * 2 ** Math.min(attempts, 9));
        const { error: failureError } = await admin.from("content_moderation_jobs").update({
          status: "failed", attempts,
          next_attempt_at: new Date(Date.now() + retryMinutes * 60 * 1000).toISOString(),
          last_error: "Moderation processing failed.",
          lease_token: null, lease_expires_at: null,
        }).eq("id", job.id).eq("lease_token", job.lease_token);
        if (failureError) throw failureError;
        summary.failed += 1;
      }
    }

    return json(summary);
  } catch (error) {
    return respondToError(error);
  }
});
