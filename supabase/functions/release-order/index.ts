import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";
import { releaseOrderFunds } from "../_shared/order-payments.ts";

type ReleaseRequest = { orderId: string };

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const input = await readJson<ReleaseRequest>(request);
    const admin = createAdminClient();
    const { data: order, error } = await admin.from("orders").select("*").eq("id", input.orderId).single();
    if (error || !order) throw new HttpError(404, "Order not found.", "order_not_found");
    if (order.buyer_id !== user.id) throw new HttpError(403, "Only the buyer can accept this order.", "forbidden");
    if (order.status === "completed") return json({ orderId: order.id, status: order.status });
    if (order.status !== "inspection") throw new HttpError(409, "Order is not in its inspection period.", "invalid_order_state");
    if (!order.stripe_payment_intent_id) throw new HttpError(409, "Payment record is missing.", "missing_payment");

    const { data: claimedOrder, error: claimError } = await admin.from("orders").update({ status: "accepted" })
      .eq("id", order.id).eq("status", "inspection").select("*").maybeSingle();
    if (claimError) throw claimError;
    if (!claimedOrder) throw new HttpError(409, "Order state changed. Refresh and try again.", "order_state_changed");
    let transferId: string;
    try {
      transferId = await releaseOrderFunds(admin, claimedOrder);
    } catch (transferError) {
      const { error: pendingError } = await admin.from("orders").update({ status: "transfer_pending" }).eq("id", order.id).eq("status", "accepted");
      if (pendingError) throw pendingError;
      throw transferError;
    }
    const { error: completeError } = await admin.rpc("complete_order_transfer", { target_order_id: order.id, transfer_id: transferId });
    if (completeError) throw completeError;
    return json({ orderId: order.id, status: "completed" });
  } catch (error) {
    return respondToError(error);
  }
});
