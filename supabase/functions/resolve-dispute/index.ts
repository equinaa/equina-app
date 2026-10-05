import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireStaff, requireUser } from "../_shared/supabase.ts";
import { getStripe } from "../_shared/stripe.ts";
import { releaseOrderFunds } from "../_shared/order-payments.ts";

type Resolution = "release" | "partial_refund" | "return_refund" | "full_refund" | "dismissed";
type ResolveRequest = { disputeId: string; resolution: Resolution; refundAmountMinor?: number; returnReceived?: boolean };

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user, token } = await requireUser(request);
    await requireStaff(user.id, token);
    const input = await readJson<ResolveRequest>(request);
    if (!["release", "partial_refund", "return_refund", "full_refund", "dismissed"].includes(input.resolution)) {
      throw new HttpError(400, "A valid dispute resolution is required.", "invalid_resolution");
    }
    if (input.resolution === "return_refund" && input.returnReceived !== true) {
      throw new HttpError(409, "Confirm the returned item was received before refunding.", "return_not_received");
    }
    const admin = createAdminClient();
    const { data: dispute, error } = await admin.from("order_disputes").select("*,orders(*)").eq("id", input.disputeId).single();
    if (error || !dispute) throw new HttpError(404, "Dispute not found.", "dispute_not_found");
    if (dispute.status === "resolved") return json({ disputeId: dispute.id, status: "resolved", resolution: dispute.resolution });
    const order = dispute.orders;
    if (!order?.stripe_payment_intent_id) throw new HttpError(409, "Order payment record is missing.", "missing_payment");

    const evidence = await admin.from("dispute_evidence").select("id", { count: "exact", head: true }).eq("dispute_id", dispute.id);
    if (evidence.error) throw evidence.error;
    if ((evidence.count ?? 0) < 2 && !["release", "dismissed"].includes(input.resolution)) {
      throw new HttpError(409, "At least two evidence files are required for a refund decision.", "evidence_required");
    }

    const amount = input.resolution === "partial_refund" ? input.refundAmountMinor :
      ["return_refund", "full_refund"].includes(input.resolution) ? order.total_amount_minor : null;
    if (amount !== null && (!Number.isInteger(amount) || amount < 1 || amount > order.total_amount_minor)) {
      throw new HttpError(400, "Refund amount is invalid.", "invalid_refund_amount");
    }

    if (dispute.resolution && dispute.resolution !== input.resolution) {
      throw new HttpError(409, "A different resolution is already being processed.", "resolution_conflict");
    }
    if (!dispute.resolution) {
      const { data: claimed, error: claimError } = await admin.from("order_disputes").update({
        status: "under_review", resolution: input.resolution, refund_amount_minor: amount,
        assigned_to: user.id,
      }).eq("id", dispute.id).is("resolution", null).neq("status", "resolved").select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) throw new HttpError(409, "Dispute state changed. Refresh and try again.", "dispute_state_changed");
    }

    if (["partial_refund", "return_refund", "full_refund"].includes(input.resolution)) {
      const refundAmount = amount as number;
      const stripe = getStripe();
      if (!["refund_pending", "refunded"].includes(order.status)) {
        const { error: pendingError } = await admin.from("orders").update({ status: "refund_pending" }).eq("id", order.id);
        if (pendingError) throw pendingError;
      }
      if (order.stripe_transfer_id) {
        const sellerShare = Math.min(order.seller_net_minor, refundAmount);
        if (sellerShare > 0) await stripe.transfers.createReversal(order.stripe_transfer_id, { amount: sellerShare }, { idempotencyKey: `reverse-${dispute.id}` });
      }
      const refund = await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id, amount: refundAmount, metadata: { equina_dispute_id: dispute.id } }, { idempotencyKey: `refund-${dispute.id}` });
      const { error: finalizeError } = await admin.rpc("finalize_dispute_refund", {
        target_dispute_id: dispute.id, refund_id: refund.id, refund_amount: refundAmount,
        is_partial: input.resolution === "partial_refund",
      });
      if (finalizeError) throw finalizeError;
    } else {
      let transferId = order.stripe_transfer_id as string | null;
      if (!transferId) transferId = await releaseOrderFunds(admin, order);
      const { error: finalizeError } = await admin.rpc("finalize_dispute_release", { target_dispute_id: dispute.id, transfer_id: transferId });
      if (finalizeError) throw finalizeError;
    }

    return json({ disputeId: dispute.id, status: "resolved", resolution: input.resolution });
  } catch (error) {
    return respondToError(error);
  }
});
