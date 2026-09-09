const enabled = (value: string | undefined) => value?.trim().toLowerCase() === "true";

export const equinaFeatureFlags = {
  accountSettings: enabled(process.env.EXPO_PUBLIC_ENABLE_ACCOUNT_SETTINGS),
  coachChat: enabled(process.env.EXPO_PUBLIC_ENABLE_COACH_CHAT),
  pushNotifications: enabled(process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS),
  clubPublishing: false,
  clubInteractions: false,
  shopTransactions: false,
  shopListingCreation: false,
  shopMessaging: enabled(process.env.EXPO_PUBLIC_ENABLE_SHOP_MESSAGING),
  recordMutations: enabled(process.env.EXPO_PUBLIC_ENABLE_RECORD_MUTATIONS),
  horseManagement: enabled(process.env.EXPO_PUBLIC_ENABLE_HORSE_MANAGEMENT),
  rideLogging: enabled(process.env.EXPO_PUBLIC_ENABLE_RIDE_LOGGING)
} as const;

export type EquinaFeatureFlag = keyof typeof equinaFeatureFlags;

export const featureFlagReason: Record<EquinaFeatureFlag, string> = {
  accountSettings: "Account settings require a verified session, server persistence, export, and deletion operations.",
  coachChat: "Ralf requires an authenticated provider boundary, safety controls, and persisted history.",
  pushNotifications: "Push requires registered devices, redacted payloads, preferences, and delivery retry.",
  clubPublishing: "Posting requires authenticated persistence and moderation.",
  clubInteractions: "Social actions require persisted identities, reporting, and rollback.",
  shopTransactions: "Purchases require a live payment, shipping, tax, and webhook boundary.",
  shopListingCreation: "Listing creation requires uploads, seller verification, and moderation.",
  shopMessaging: "Messaging requires authenticated persistence, reporting, and delivery state.",
  recordMutations: "Horse records require secure persistence and signed file uploads.",
  horseManagement: "Horse management requires authenticated profile persistence.",
  rideLogging: "The ride journal requires authenticated persistence and a restart-survival pass on all three platforms."
};
