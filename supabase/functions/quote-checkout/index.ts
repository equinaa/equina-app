import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireActiveUser, requireFeature, requireUser } from "../_shared/supabase.ts";

type QuoteRequest = { listingId: string; destinationCountry: string; shippingRateId?: string };

const calculateBusinessTax = async (payload: Record<string, unknown>) => {
  const endpoint = Deno.env.get("TAX_QUOTE_URL");
  const token = Deno.env.get("TAX_QUOTE_TOKEN");
  if (!endpoint || !token) throw new HttpError(503, "Tax calculation is not configured for business sellers.", "tax_provider_unavailable");
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new HttpError(503, "Tax provider is temporarily unavailable.", "tax_provider_unavailable");
  }
  if (!response.ok) throw new HttpError(503, "Tax could not be calculated.", "tax_quote_failed");
  const result = await response.json() as { taxAmountMinor?: number; basis?: string };
  if (!Number.isInteger(result.taxAmountMinor) || result.taxAmountMinor! < 0 || !result.basis) {
    throw new HttpError(502, "Tax provider returned an invalid quote.", "invalid_tax_quote");
  }
  return { amount: result.taxAmountMinor!, basis: result.basis };
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user, token } = await requireUser(request);
    await requireFeature(token, "shop_transactions");
    await requireActiveUser(user.id);
    const input = await readJson<QuoteRequest>(request);
    const country = input.destinationCountry?.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, "Use a two-letter destination country.", "invalid_country");

    const admin = createAdminClient();
    const { data: listing, error: listingError } = await admin.from("listings").select("id,seller_id,category,price_minor,currency,status,country_code").eq("id", input.listingId).single();
    if (listingError || !listing || listing.status !== "active") throw new HttpError(409, "Listing is not available.", "listing_unavailable");
    if (listing.seller_id === user.id) throw new HttpError(409, "You cannot buy your own listing.", "own_listing");

    let ratesQuery = admin.from("listing_shipping_rates").select("*").eq("listing_id", listing.id).in("country_code", [country, "*"]).order("amount_minor");
    if (input.shippingRateId) ratesQuery = ratesQuery.eq("id", input.shippingRateId);
    const { data: rates, error: ratesError } = await ratesQuery;
    if (ratesError) throw ratesError;
    const rate = rates?.find((entry) => entry.country_code === country) ?? rates?.[0];
    if (!rate) throw new HttpError(409, "The seller does not ship to this destination.", "shipping_unavailable");
    if (listing.price_minor >= 100000 && (!rate.tracked || rate.insured_up_to_minor < listing.price_minor)) {
      throw new HttpError(409, "This high-value item needs tracked, fully insured shipping.", "insurance_required");
    }

    const { data: seller, error: sellerError } = await admin.from("seller_accounts").select("seller_type,country_code,verification_status,tax_collection_ready").eq("user_id", listing.seller_id).single();
    if (sellerError || !seller || seller.verification_status !== "verified") throw new HttpError(409, "Seller checkout is not ready.", "seller_not_ready");
    await requireActiveUser(listing.seller_id);
    if (seller.seller_type === "business" && !seller.tax_collection_ready) {
      throw new HttpError(409, "Business seller tax setup is incomplete.", "seller_tax_not_ready");
    }

    const tax = seller.seller_type === "private"
      ? { amount: 0, basis: "private_seller_marketplace_not_collecting_tax" }
      : await calculateBusinessTax({
          sellerCountry: seller.country_code,
          destinationCountry: country,
          amountMinor: listing.price_minor,
          shippingMinor: rate.amount_minor,
          currency: listing.currency,
          category: listing.category,
        });

    const configuredFee = Number(Deno.env.get("MARKETPLACE_FEE_BPS") ?? "800");
    const feeBps = Number.isFinite(configuredFee) ? Math.min(1200, Math.max(0, configuredFee)) : 800;
    const protectionFee = Math.round(listing.price_minor * feeBps / 10000);
    const { data: quote, error: quoteError } = await admin.from("checkout_quotes").insert({
      buyer_id: user.id,
      listing_id: listing.id,
      shipping_rate_id: rate.id,
      item_amount_minor: listing.price_minor,
      shipping_amount_minor: rate.amount_minor,
      tax_amount_minor: tax.amount,
      protection_fee_minor: protectionFee,
      currency: listing.currency,
      destination_country: country,
      tax_basis: tax.basis,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }).select("*").single();
    if (quoteError || !quote) throw quoteError ?? new Error("Quote was not created.");

    return json({ quote, shipping: { service: rate.service_name, minDays: rate.min_days, maxDays: rate.max_days, tracked: rate.tracked } }, 201);
  } catch (error) {
    return respondToError(error);
  }
});
