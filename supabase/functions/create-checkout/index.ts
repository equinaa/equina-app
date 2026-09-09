import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireActiveUser, requireFeature, requireUser } from "../_shared/supabase.ts";
import { getStripe } from "../_shared/stripe.ts";

type Address = { name: string; line1: string; line2?: string; city: string; region?: string; postalCode: string; country: string };
type CheckoutRequest = { quoteId: string; idempotencyKey: string; shippingAddress: Address; acceptedMarketplaceTerms: boolean };

const normalizedAddress = (input: Address) => {
  const address = {
    name: input?.name?.trim(),
    line1: input?.line1?.trim(),
    line2: input?.line2?.trim() || null,
    city: input?.city?.trim(),
    region: input?.region?.trim() || null,
    postal_code: input?.postalCode?.trim(),
    country: input?.country?.trim().toUpperCase(),
  };
  if (!address.name || !address.line1 || !address.city || !address.postal_code || !/^[A-Z]{2}$/.test(address.country)) {
    throw new HttpError(400, "A complete shipping address is required.", "invalid_shipping_address");
  }
  if (address.name.length > 120 || address.line1.length > 160 || (address.line2?.length ?? 0) > 160 || address.city.length > 100 || (address.region?.length ?? 0) > 100 || address.postal_code.length > 24) {
    throw new HttpError(400, "Shipping address contains an invalid field.", "invalid_shipping_address");
  }
  return address;
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  let orderId: string | undefined;
  let paymentIntentId: string | undefined;
  try {
    requireMethod(request, "POST");
    const { user, token } = await requireUser(request);
    await requireFeature(token, "shop_transactions");
    await requireActiveUser(user.id);
    const input = await readJson<CheckoutRequest>(request);
    if (!/^[0-9a-f-]{36}$/i.test(input.quoteId) || !/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)) {
      throw new HttpError(400, "Invalid checkout identifiers.", "invalid_checkout_id");
    }
    if (input.acceptedMarketplaceTerms !== true) {
      throw new HttpError(400, "Marketplace terms must be accepted.", "terms_not_accepted");
    }
    const termsVersion = Deno.env.get("MARKETPLACE_TERMS_VERSION");
    if (!termsVersion) throw new HttpError(503, "Marketplace terms are not configured.", "terms_unavailable");
    const address = normalizedAddress(input.shippingAddress);
    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin.rpc("begin_checkout_for_user", {
      target_buyer_id: user.id,
      target_quote_id: input.quoteId,
      request_key: input.idempotencyKey,
      address,
      accepted_terms_version: termsVersion,
    });
    if (orderError || !order) throw new HttpError(409, orderError?.message ?? "Checkout could not start.", "checkout_conflict");
    orderId = order.id;

    const { data: seller, error: sellerError } = await admin.from("seller_accounts").select("stripe_account_id,payout_hold_until").eq("user_id", order.seller_id).single();
    if (sellerError || !seller?.stripe_account_id) throw new HttpError(409, "Seller payout account is not ready.", "seller_payout_unavailable");
    if (seller.payout_hold_until && new Date(seller.payout_hold_until).getTime() > Date.now()) {
      throw new HttpError(409, "Seller payouts are temporarily unavailable.", "seller_payout_hold");
    }

    if (order.stripe_payment_intent_id) {
      const existing = await getStripe().paymentIntents.retrieve(order.stripe_payment_intent_id);
      if (existing.status === "canceled") throw new HttpError(409, "This checkout has expired.", "checkout_expired");
      if (existing.status === "succeeded" && !["paid", "seller_preparing", "shipped", "inspection", "accepted", "completed"].includes(order.status)) {
        const chargeId = typeof existing.latest_charge === "string" ? existing.latest_charge : existing.latest_charge?.id ?? null;
        const { error: paidError } = await admin.from("orders").update({ status: "paid", paid_at: new Date().toISOString(), stripe_charge_id: chargeId }).eq("id", order.id);
        if (paidError) throw paidError;
        return json({ orderId: order.id, clientSecret: existing.client_secret, status: "paid" });
      }
      return json({ orderId: order.id, clientSecret: existing.client_secret, status: order.status });
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: order.total_amount_minor,
      currency: order.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      capture_method: "automatic",
      description: `Equina order ${order.id}`,
      metadata: {
        equina_order_id: order.id,
        equina_listing_id: order.listing_id,
        equina_buyer_id: user.id,
        equina_seller_id: order.seller_id,
        marketplace_terms_version: Deno.env.get("MARKETPLACE_TERMS_VERSION") ?? "unversioned",
      },
      transfer_group: `EQUINA_ORDER_${order.id}`,
      shipping: {
        name: address.name,
        address: {
          line1: address.line1,
          line2: address.line2 ?? undefined,
          city: address.city,
          state: address.region ?? undefined,
          postal_code: address.postal_code,
          country: address.country,
        },
      },
    }, { idempotencyKey: `checkout-${order.id}` });
    paymentIntentId = paymentIntent.id;

    if (!paymentIntent.client_secret) throw new Error("Stripe did not return a client secret.");
    const { error: updateError } = await admin.from("orders").update({
      stripe_payment_intent_id: paymentIntent.id,
      status: "processing_payment",
    }).eq("id", order.id);
    if (updateError) {
      await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => undefined);
      throw updateError;
    }

    return json({ orderId: order.id, clientSecret: paymentIntent.client_secret, status: "processing_payment" }, 201);
  } catch (error) {
    if (orderId) {
      const admin = createAdminClient();
      const { data: order } = await admin.from("orders").select("listing_id,status,stripe_payment_intent_id").eq("id", orderId).maybeSingle();
      if (order && ["payment_pending", "processing_payment"].includes(order.status)) {
        const stripeId = order.stripe_payment_intent_id ?? paymentIntentId;
        if (stripeId) {
          try {
            const stripe = getStripe();
            const intent = await stripe.paymentIntents.retrieve(stripeId);
            if (intent.status === "succeeded") {
              const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id ?? null;
              await admin.from("orders").update({
                stripe_payment_intent_id: intent.id, stripe_charge_id: chargeId,
                status: "paid", paid_at: new Date().toISOString(),
              }).eq("id", orderId);
              return respondToError(error);
            }
            if (intent.status !== "canceled") await stripe.paymentIntents.cancel(intent.id);
          } catch {
            return respondToError(error);
          }
        }
        await admin.from("orders").update({ status: "canceled", stripe_payment_intent_id: stripeId ?? null }).eq("id", orderId);
        await admin.from("listings").update({ status: "active", reserved_until: null }).eq("id", order.listing_id).eq("status", "reserved");
      }
    }
    return respondToError(error);
  }
});
