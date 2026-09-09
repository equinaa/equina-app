import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireStaff, requireUser } from "../_shared/supabase.ts";

type ReportDomain = "club" | "marketplace";
type ReportAction = "dismiss" | "hide" | "warn" | "suspend";
type RequestBody = { domain: ReportDomain; reportId: string; action: ReportAction; note?: string; suspensionDays?: number };

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    await requireStaff(user.id);
    const input = await readJson<RequestBody>(request);
    if (!["club", "marketplace"].includes(input.domain) || !["dismiss", "hide", "warn", "suspend"].includes(input.action)) {
      throw new HttpError(400, "Report domain and action are required.", "invalid_moderation_action");
    }
    const note = input.note?.trim() || "Trust and safety review";
    if (note.length > 1000) throw new HttpError(400, "Moderation note is too long.", "invalid_note");
    const admin = createAdminClient();
    const table = input.domain === "club" ? "content_reports" : "marketplace_reports";
    const { data: report, error } = await admin.from(table).select("*").eq("id", input.reportId).single();
    if (error || !report) throw new HttpError(404, "Report not found.", "report_not_found");
    if (["actioned", "dismissed"].includes(report.status)) return json({ reportId: report.id, status: report.status });

    let targetType: "post" | "comment" | "listing" | "message" | "user";
    let targetId: string;
    let targetUserId: string | null = report.reported_user_id ?? null;
    let listingStatus: string | null = null;
    if (input.domain === "club" && report.post_id) {
      targetType = "post"; targetId = report.post_id;
      const { data: post } = await admin.from("club_posts").select("author_id").eq("id", targetId).single();
      targetUserId ??= post?.author_id ?? null;
    } else if (input.domain === "club" && report.comment_id) {
      targetType = "comment"; targetId = report.comment_id;
      const { data: comment } = await admin.from("club_comments").select("author_id").eq("id", targetId).single();
      targetUserId ??= comment?.author_id ?? null;
    } else if (input.domain === "marketplace" && report.listing_id) {
      targetType = "listing"; targetId = report.listing_id;
      const { data: listing } = await admin.from("listings").select("seller_id,status").eq("id", targetId).single();
      targetUserId ??= listing?.seller_id ?? null;
      listingStatus = listing?.status ?? null;
    } else if (input.domain === "marketplace" && report.message_id) {
      targetType = "message"; targetId = report.message_id;
      const { data: message } = await admin.from("marketplace_messages").select("sender_id").eq("id", targetId).single();
      targetUserId ??= message?.sender_id ?? null;
    } else if (targetUserId) {
      targetType = "user"; targetId = targetUserId;
    } else {
      throw new HttpError(409, "Report target no longer exists.", "report_target_missing");
    }

    if (input.action === "hide") {
      if (targetType === "post") {
        const { error: updateError } = await admin.from("club_posts").update({ moderation_status: "hidden" }).eq("id", targetId);
        if (updateError) throw updateError;
      } else if (targetType === "comment") {
        const { error: updateError } = await admin.from("club_comments").update({ moderation_status: "hidden" }).eq("id", targetId);
        if (updateError) throw updateError;
      } else if (targetType === "listing") {
        if (["reserved", "sold"].includes(listingStatus ?? "")) {
          throw new HttpError(409, "Listing has an order and requires commerce escalation.", "listing_has_order");
        }
        const { error: updateError } = await admin.from("listings").update({ status: "archived", moderation_note: note, reserved_until: null }).eq("id", targetId);
        if (updateError) throw updateError;
      } else if (targetType === "message") {
        const { error: updateError } = await admin.from("marketplace_messages").update({ deleted_at: new Date().toISOString() }).eq("id", targetId);
        if (updateError) throw updateError;
      }
    }

    if (["warn", "suspend"].includes(input.action)) {
      if (!targetUserId) throw new HttpError(409, "Reported account no longer exists.", "reported_user_missing");
      const { data: protectedRoles, error: roleError } = await admin.from("user_roles").select("role")
        .eq("user_id", targetUserId).in("role", ["moderator", "admin"]);
      if (roleError) throw roleError;
      if (protectedRoles?.length) throw new HttpError(409, "Staff accounts require administrator review.", "staff_escalation_required");
      const days = input.action === "suspend" ? Math.min(365, Math.max(1, Math.round(input.suspensionDays ?? 7))) : null;
      const { error: sanctionError } = await admin.from("user_sanctions").insert({
        user_id: targetUserId, kind: input.action === "suspend" ? "suspension" : "warning",
        reason: note, issued_by: user.id,
        expires_at: days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null,
      });
      if (sanctionError) throw sanctionError;
    }

    const reportStatus = input.action === "dismiss" ? "dismissed" : "actioned";
    const { error: reportError } = await admin.from(table).update({
      status: reportStatus, assigned_to: user.id, resolved_at: new Date().toISOString(),
    }).eq("id", report.id);
    if (reportError) throw reportError;
    if (input.action !== "dismiss") {
      const { error: actionError } = await admin.from("moderation_actions").insert({
        moderator_id: user.id,
        report_id: input.domain === "club" ? report.id : null,
        marketplace_report_id: input.domain === "marketplace" ? report.id : null,
        target_type: targetType, target_id: targetId,
        action: input.action === "hide" ? "hide" : input.action,
        notes: note,
      });
      if (actionError) throw actionError;
    }
    return json({ reportId: report.id, status: reportStatus, action: input.action });
  } catch (error) {
    return respondToError(error);
  }
});
