import { requireAutomationSecret } from "../_shared/automation.ts";
import { json, respondToError, requireMethod } from "../_shared/http.ts";
import { releaseOrderFunds } from "../_shared/order-payments.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { getStripe } from "../_shared/stripe.ts";

Deno.serve(async (request) => {
  try {
    requireMethod(request, "POST");
    await requireAutomationSecret(
      request,
      "ORDER_AUTOMATION_SECRET",
      "x-equina-cron-secret",
    );
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const result = { expiredCheckouts: 0, releasedOrders: 0, pendingTransfers: 0 };

    const { data: expiredListings, error: expiredError } = await admin.from("listings").select("id").eq("status", "reserved").lt("reserved_until", now).limit(100);
    if (expiredError) throw expiredError;
    for (const listing of expiredListings ?? []) {
      const { data: order, error: orderError } = await admin.from("orders").select("id,status,stripe_payment_intent_id").eq("listing_id", listing.id).in("status", ["payment_pending", "processing_payment", "payment_failed"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (orderError) throw orderError;
      if (order?.stripe_payment_intent_id) {
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
        if (paymentIntent.status === "succeeded") {
          const { error: paidError } = await admin.from("orders").update({ status: "paid", paid_at: now }).eq("id", order.id);
          if (paidError) throw paidError;
          continue;
        }
        if (paymentIntent.status !== "canceled") {
          try {
            await stripe.paymentIntents.cancel(paymentIntent.id);
          } catch {
            continue;
          }
        }
      }
      if (order) {
        const { error: cancelError } = await admin.from("orders").update({ status: "canceled" }).eq("id", order.id);
        if (cancelError) throw cancelError;
      }
      const { error: releaseListingError } = await admin.from("listings").update({ status: "active", reserved_until: null }).eq("id", listing.id).eq("status", "reserved");
      if (releaseListingError) throw releaseListingError;
      result.expiredCheckouts += 1;
    }

    const { data: inspectionOrders, error: inspectionError } = await admin.from("orders").select("*").eq("status", "inspection").lt("inspection_ends_at", now).limit(100);
    if (inspectionError) throw inspectionError;
    for (const order of inspectionOrders ?? []) {
      const { data: claimedOrder, error: claimError } = await admin.from("orders").update({ status: "accepted" })
        .eq("id", order.id).eq("status", "inspection").select("*").maybeSingle();
      if (claimError) throw claimError;
      if (!claimedOrder) continue;
      let transferId: string;
      try {
        transferId = await releaseOrderFunds(admin, claimedOrder);
      } catch {
        const { error: pendingError } = await admin.from("orders").update({ status: "transfer_pending" }).eq("id", order.id).eq("status", "accepted");
        if (pendingError) throw pendingError;
        result.pendingTransfers += 1;
        continue;
      }
      const { error: completeError } = await admin.rpc("complete_order_transfer", { target_order_id: order.id, transfer_id: transferId });
      if (completeError) throw completeError;
      result.releasedOrders += 1;
    }

    const { data: pendingOrders, error: pendingQueryError } = await admin.from("orders").select("*").eq("status", "transfer_pending").limit(100);
    if (pendingQueryError) throw pendingQueryError;
    for (const order of pendingOrders ?? []) {
      try {
        const transferId = await releaseOrderFunds(admin, order);
        const { error: completeError } = await admin.rpc("complete_order_transfer", { target_order_id: order.id, transfer_id: transferId });
        if (completeError) throw completeError;
        result.releasedOrders += 1;
      } catch {
        result.pendingTransfers += 1;
      }
    }

    return json(result);
  } catch (error) {
    return respondToError(error);
  }
});
