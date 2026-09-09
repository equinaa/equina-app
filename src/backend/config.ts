export type BackendConfig = {
  url: string;
  publishableKey: string;
  stripePublishableKey?: string;
};

const clean = (value: string | undefined) => value?.trim() ?? "";

export const readBackendConfig = (): BackendConfig | null => {
  const url = clean(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const publishableKey = clean(
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!url || !publishableKey) return null;

  return {
    url: url.replace(/\/$/, ""),
    publishableKey,
    stripePublishableKey: clean(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) || undefined
  };
};

export const isBackendConfigured = () => readBackendConfig() !== null;

