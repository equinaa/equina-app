import { HttpError, json, respondToError, requireMethod } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { getStripe, verifyStripeEvent } from "../_shared/stripe.ts";

const throwIfError = (error: unknown) => {
  if (error) throw error;
};

Deno.serve(async (request) => {
  try {
    requireMethod(request, "POST");
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new HttpError(400, "Missing Stripe signature.", "missing_signature");
    const payload = await request.text();
    const event = await verifyStripeEvent(payload, signature);
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const object = event.data.object as unknown as Record<string, unknown>;
    const objectId = typeof object.id === "string" ? object.id : null;
    const { error: claimError } = await admin.from("payment_webhook_events").insert({
      id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      object_id: objectId,
      processing_started_at: now,
    });
    if (claimError?.code === "23505") {
      const { data: existing, error: existingError } = await admin.from("payment_webhook_events")
        .select("processing_status,processing_started_at,attempts").eq("id", event.id).single();
      throwIfError(existingError);
      if (["processed", "ignored"].includes(existing?.processing_status)) return json({ received: true, duplicate: true });
      const startedAt = new Date(existing?.processing_started_at ?? 0).getTime();
      if (existing?.processing_status === "processing" && Date.now() - startedAt < 5 * 60 * 1000) {
        throw new HttpError(409, "Webhook is already being processed.", "event_in_progress");
      }
      const { error: reclaimError } = await admin.from("payment_webhook_events").update({
        processing_status: "processing",
        processing_started_at: now,
        attempts: Math.min(50, Number(existing?.attempts ?? 1) + 1),
        error_message: null,
      }).eq("id", event.id);
      throwIfError(reclaimError);
    } else if (claimError) {
      throw claimError;
    }

    try {
      let handled = false;
      if (event.type.startsWith("payment_intent.")) {
        const paymentIntent = event.data.object as { id: string; latest_charge?: string | { id: string } | null; status?: string };
        const { data: order, error: orderError } = await admin.from("orders").select("id,listing_id,status")
          .eq("stripe_payment_intent_id", paymentIntent.id).maybeSingle();
        throwIfError(orderError);
        if (order) {
          handled = true;
          if (event.type === "payment_intent.succeeded" && ["payment_pending", "processing_payment", "payment_failed"].includes(order.status)) {
            const chargeId = typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id ?? null;
            const { error } = await admin.from("orders").update({ status: "paid", paid_at: now, stripe_charge_id: chargeId }).eq("id", order.id);
            throwIfError(error);
          } else if (event.type === "payment_intent.payment_failed" && ["payment_pending", "processing_payment"].includes(order.status)) {
            const { error: failedError } = await admin.from("orders").update({ status: "payment_failed" }).eq("id", order.id);
            throwIfError(failedError);
            try {
              const stripe = getStripe();
              const current = await stripe.paymentIntents.retrieve(paymentIntent.id);
              if (current.status !== "canceled" && current.status !== "succeeded") await stripe.paymentIntents.cancel(current.id);
            } catch (cancelError) {
              const current = await getStripe().paymentIntents.retrieve(paymentIntent.id);
              if (current.status === "succeeded") throw cancelError;
            }
            const { error: cancelOrderError } = await admin.from("orders").update({ status: "canceled" }).eq("id", order.id).eq("status", "payment_failed");
            throwIfError(cancelOrderError);
            const { error: listingError } = await admin.from("listings").update({ status: "active", reserved_until: null })
              .eq("id", order.listing_id).eq("status", "reserved");
            throwIfError(listingError);
          } else if (event.type === "payment_intent.canceled" && ["payment_pending", "processing_payment", "payment_failed"].includes(order.status)) {
            const { error: cancelError } = await admin.from("orders").update({ status: "canceled" }).eq("id", order.id);
            throwIfError(cancelError);
            const { error: listingError } = await admin.from("listings").update({ status: "active", reserved_until: null })
              .eq("id", order.listing_id).eq("status", "reserved");
            throwIfError(listingError);
          }
        }
      } else if (event.type === "charge.refunded") {
        const charge = event.data.object as {
          id: string;
          payment_intent?: string | null;
          refunded?: boolean;
          refunds?: { data?: Array<{ id: string; created?: number }> };
        };
        const query = charge.payment_intent
          ? admin.from("orders").select("id,listing_id,status").eq("stripe_payment_intent_id", charge.payment_intent)
          : admin.from("orders").select("id,listing_id,status").eq("stripe_charge_id", charge.id);
        const { data: order, error: orderError } = await query.maybeSingle();
        throwIfError(orderError);
        if (order) {
          handled = true;
          const latestRefund = [...(charge.refunds?.data ?? [])].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
          if (charge.refunded === true && order.status !== "refunded") {
            if (order.status !== "refund_pending") {
              const { error } = await admin.from("orders").update({ status: "refund_pending" }).eq("id", order.id);
              throwIfError(error);
            }
            const { error } = await admin.from("orders").update({ status: "refunded", stripe_refund_id: latestRefund?.id ?? null }).eq("id", order.id);
            throwIfError(error);
            const { error: listingError } = await admin.from("listings").update({ status: "archived", reserved_until: null }).eq("id", order.listing_id);
            throwIfError(listingError);
          } else if (latestRefund) {
            const update = order.status === "refund_pending"
              ? { status: "completed", stripe_refund_id: latestRefund.id }
              : { stripe_refund_id: latestRefund.id };
            const { error } = await admin.from("orders").update(update).eq("id", order.id);
            throwIfError(error);
            if (order.status === "refund_pending") {
              const { error: listingError } = await admin.from("listings").update({ status: "sold", reserved_until: null }).eq("id", order.listing_id);
              throwIfError(listingError);
            }
          }
        }
      } else if (event.type === "charge.dispute.created") {
        const stripeDispute = event.data.object as { id: string; charge?: string | { id: string }; reason?: string };
        const chargeId = typeof stripeDispute.charge === "string" ? stripeDispute.charge : stripeDispute.charge?.id;
        if (chargeId) {
          const { data: order, error: orderError } = await admin.from("orders")
            .select("id,buyer_id,seller_id,status,stripe_transfer_id,seller_net_minor").eq("stripe_charge_id", chargeId).maybeSingle();
          throwIfError(orderError);
          if (order) {
            handled = true;
            if (order.stripe_transfer_id) {
              const stripe = getStripe();
              const transfer = await stripe.transfers.retrieve(order.stripe_transfer_id);
              const remaining = Math.max(0, transfer.amount - transfer.amount_reversed);
              if (remaining > 0) {
                await stripe.transfers.createReversal(transfer.id, { amount: remaining }, { idempotencyKey: `chargeback-${stripeDispute.id}` });
              }
            }
            if (order.status !== "refunded" && order.status !== "disputed") {
              const { error } = await admin.from("orders").update({ status: "disputed" }).eq("id", order.id);
              throwIfError(error);
            }
            const { data: existingDispute, error: disputeReadError } = await admin.from("order_disputes").select("id")
              .eq("order_id", order.id).maybeSingle();
            throwIfError(disputeReadError);
            if (existingDispute) {
              const { error } = await admin.from("order_disputes").update({
                status: "under_review", resolution: null, refund_amount_minor: null,
                source: "payment_processor", external_dispute_id: stripeDispute.id, resolved_at: null,
              }).eq("id", existingDispute.id);
              throwIfError(error);
            } else {
              const { error } = await admin.from("order_disputes").insert({
                order_id: order.id, opened_by: order.buyer_id, reason: "other",
                detail: `Payment processor dispute: ${stripeDispute.reason ?? "unspecified"}`,
                status: "under_review", source: "payment_processor", external_dispute_id: stripeDispute.id,
              });
              throwIfError(error);
            }
            const { error: sellerHoldError } = await admin.from("seller_accounts").update({
              risk_level: "high", payout_hold_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }).eq("user_id", order.seller_id);
            throwIfError(sellerHoldError);
          }
        }
      } else if (event.type === "account.updated") {
        const account = event.data.object as {
          id: string;
          charges_enabled: boolean;
          payouts_enabled: boolean;
          details_submitted: boolean;
          capabilities?: { transfers?: string };
          requirements?: { currently_due?: string[]; disabled_reason?: string | null };
        };
        const verified = account.payouts_enabled && account.capabilities?.transfers === "active" && account.details_submitted && !(account.requirements?.currently_due?.length);
        const { error } = await admin.from("seller_accounts").update({
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          verification_status: verified ? "verified" : account.requirements?.disabled_reason ? "limited" : "identity_pending",
        }).eq("stripe_account_id", account.id);
        throwIfError(error);
        handled = true;
      }

      const { error: completeError } = await admin.from("payment_webhook_events").update({
        processing_status: handled ? "processed" : "ignored",
        processed_at: now,
      }).eq("id", event.id);
      throwIfError(completeError);
      return json({ received: true, handled });
    } catch (processingError) {
      await admin.from("payment_webhook_events").update({
        processing_status: "failed",
        error_message: processingError instanceof Error ? processingError.message.slice(0, 1000) : "Unknown processing error",
      }).eq("id", event.id);
      throw processingError;
    }
  } catch (error) {
    return respondToError(error);
  }
});
