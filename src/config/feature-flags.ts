const enabled = (value: string | undefined) => value?.trim().toLowerCase() === "true";

export const equinaFeatureFlags = {
  accountSettings: enabled(process.env.EXPO_PUBLIC_ENABLE_ACCOUNT_SETTINGS),
  coachChat: enabled(process.env.EXPO_PUBLIC_ENABLE_COACH_CHAT),
  pushNotifications: enabled(process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS),
  // Default false when the variable is absent, so nothing activates by accident.
  // These stay gated by the server capability too, and several of those also
  // require a configured provider, so a compile switch alone opens nothing.
  clubPublishing: enabled(process.env.EXPO_PUBLIC_ENABLE_CLUB_PUBLISHING),
  clubInteractions: enabled(process.env.EXPO_PUBLIC_ENABLE_CLUB_INTERACTIONS),
  // Photos on Club posts. Nothing strips EXIF/GPS from an upload yet, and a
  // stable photo carries its coordinates to every reader, so this stays off
  // until the processing worker in docs/EQUINA_MEDIA_PROCESSING_BOUNDARY.md
  // exists. The server gates the upload on club_publishing alone.
  clubPhotoPosts: enabled(process.env.EXPO_PUBLIC_ENABLE_CLUB_PHOTO_POSTS),
  shopTransactions: enabled(process.env.EXPO_PUBLIC_ENABLE_SHOP_TRANSACTIONS),
  shopListingCreation: enabled(process.env.EXPO_PUBLIC_ENABLE_SHOP_LISTING_CREATION),
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
  clubPhotoPosts: "Photos on posts require EXIF and GPS removal before any reader sees them.",
  shopTransactions: "Purchases require a live payment, shipping, tax, and webhook boundary.",
  shopListingCreation: "Listing creation requires uploads, seller verification, and moderation.",
  shopMessaging: "Messaging requires authenticated persistence, reporting, and delivery state.",
  recordMutations: "Horse records require secure persistence and signed file uploads.",
  horseManagement: "Horse management requires authenticated profile persistence.",
  rideLogging: "The ride journal requires authenticated persistence and a restart-survival pass on all three platforms."
};
