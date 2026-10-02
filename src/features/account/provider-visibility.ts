import type { SocialAuthProvider } from "./social-auth";

/**
 * Which social sign-in buttons a platform may show. Pure, so the rules below
 * are tested without a device.
 *
 * Apple is iOS-only. Its web and Android flow needs a Services ID and a
 * configured redirect that do not exist, and a button that opens a broken flow
 * is worse than no button.
 *
 * Google on iOS requires Apple alongside it: App Store guideline 4.8 rejects an
 * app that offers a third-party login without an equivalent privacy-focused
 * option. Switching Google on alone therefore hides it on iOS instead of
 * shipping a rejection.
 */
export const visibleProviders = (
  platform: string,
  availability: Readonly<Record<SocialAuthProvider, boolean>>
): Record<SocialAuthProvider, boolean> => ({
  apple: platform === "ios" && availability.apple,
  google: availability.google && (platform !== "ios" || availability.apple)
});
