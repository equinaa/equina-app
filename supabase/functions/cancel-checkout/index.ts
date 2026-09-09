import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";
import { getStripe } from "../_shared/stripe.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const { orderId } = await readJson<{ orderId: string }>(request);
    const admin = createAdminClient();
    const { data: order } = await admin.from("orders").select("id,buyer_id,listing_id,status,stripe_payment_intent_id").eq("id", orderId).single();
    if (!order) throw new HttpError(404, "Order not found.", "order_not_found");
    if (order.buyer_id !== user.id) throw new HttpError(403, "You cannot cancel this checkout.", "forbidden");
    if (!["payment_pending", "processing_payment", "payment_failed"].includes(order.status)) {
      throw new HttpError(409, "This checkout can no longer be canceled.", "invalid_order_state");
    }
    if (order.stripe_payment_intent_id) {
      const stripe = getStripe();
      const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
      if (paymentIntent.status === "succeeded") throw new HttpError(409, "Payment already succeeded; the order cannot be canceled.", "payment_already_succeeded");
      if (paymentIntent.status !== "canceled") await stripe.paymentIntents.cancel(paymentIntent.id);
    }
    const { error: cancelError } = await admin.from("orders").update({ status: "canceled" }).eq("id", order.id);
    if (cancelError) throw cancelError;
    const { error: listingError } = await admin.from("listings").update({ status: "active", reserved_until: null }).eq("id", order.listing_id).eq("status", "reserved");
    if (listingError) throw listingError;
    return json({ orderId: order.id, status: "canceled" });
  } catch (error) {
    return respondToError(error);
  }
});
