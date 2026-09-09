import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireActiveUser, requireUser } from "../_shared/supabase.ts";
import { getStripe } from "../_shared/stripe.ts";

type SellerRequest = { sellerType: "private" | "business"; countryCode: string };

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    await requireActiveUser(user.id);
    const input = await readJson<SellerRequest>(request);
    const country = input.countryCode?.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country) || !["private", "business"].includes(input.sellerType)) {
      throw new HttpError(400, "Seller type and country are required.", "invalid_seller_profile");
    }

    const returnUrl = Deno.env.get("CONNECT_RETURN_URL");
    const refreshUrl = Deno.env.get("CONNECT_REFRESH_URL");
    if (!returnUrl || !refreshUrl) throw new Error("Connect return URLs are not configured.");

    const admin = createAdminClient();
    const { data: current } = await admin.from("seller_accounts").select("*").eq("user_id", user.id).maybeSingle();
    if (current?.stripe_account_id && current.country_code !== country) {
      throw new HttpError(409, "Seller country cannot be changed after payout setup starts.", "seller_country_locked");
    }
    const stripe = getStripe();
    let accountId = current?.stripe_account_id as string | undefined;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country,
        email: user.email,
        business_type: input.sellerType === "business" ? "company" : "individual",
        capabilities: { transfers: { requested: true } },
        metadata: { equina_user_id: user.id },
      }, { idempotencyKey: `seller-account-${user.id}` });
      accountId = account.id;
    }

    const { error } = await admin.from("seller_accounts").upsert({
      user_id: user.id,
      seller_type: input.sellerType,
      country_code: country,
      stripe_account_id: accountId,
      verification_status: "identity_pending",
    }, { onConflict: "user_id" });
    if (error) throw error;

    const { error: roleError } = await admin.from("user_roles").upsert(
      { user_id: user.id, role: "seller", granted_by: user.id },
      { onConflict: "user_id,role" },
    );
    if (roleError) throw roleError;

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
      collection_options: { fields: "eventually_due" },
    });

    return json({ url: link.url, expiresAt: new Date(link.expires_at * 1000).toISOString() });
  } catch (error) {
    return respondToError(error);
  }
});
