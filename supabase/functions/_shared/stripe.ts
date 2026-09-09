import Stripe from "npm:stripe@18.5.0";

let instance: Stripe | undefined;

export const getStripe = () => {
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured.");
  instance ??= new Stripe(secret, { httpClient: Stripe.createFetchHttpClient() });
  return instance;
};

export const verifyStripeEvent = async (payload: string, signature: string) => {
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  return await getStripe().webhooks.constructEventAsync(
    payload,
    signature,
    webhookSecret,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
};

