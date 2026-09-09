import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";
import { getStripe } from "./stripe.ts";

export type ReleasableOrder = {
  id: string;
  listing_id: string;
  seller_id: string;
  seller_net_minor: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
};

export const releaseOrderFunds = async (admin: SupabaseClient, order: ReleasableOrder) => {
  if (order.stripe_transfer_id) return order.stripe_transfer_id;
  if (!order.stripe_payment_intent_id) throw new HttpError(409, "Payment record is missing.", "missing_payment");
  const { data: seller } = await admin.from("seller_accounts").select("stripe_account_id,payout_hold_until,payouts_enabled").eq("user_id", order.seller_id).single();
  if (!seller?.stripe_account_id || !seller.payouts_enabled) throw new HttpError(409, "Seller payout is not ready.", "payout_unavailable");
  if (seller.payout_hold_until && new Date(seller.payout_hold_until).getTime() > Date.now()) {
    throw new HttpError(409, "Seller payout is temporarily held.", "seller_payout_hold");
  }

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, { expand: ["latest_charge"] });
  const latestCharge = typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id;
  if (!latestCharge) throw new Error("Payment charge is not available for transfer.");
  const transfer = await stripe.transfers.create({
    amount: order.seller_net_minor,
    currency: order.currency.toLowerCase(),
    destination: seller.stripe_account_id,
    source_transaction: latestCharge,
    transfer_group: `EQUINA_ORDER_${order.id}`,
    metadata: { equina_order_id: order.id },
  }, { idempotencyKey: `release-${order.id}` });
  return transfer.id;
};

