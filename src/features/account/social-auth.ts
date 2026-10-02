import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

export type SocialAuthProvider = "apple" | "google";
export type EmailAuthMode = "magic-link" | "otp";

export const emailAuthMode: EmailAuthMode =
  process.env.EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE === "otp" ? "otp" : "magic-link";

export const socialAuthAvailability: Readonly<Record<SocialAuthProvider, boolean>> = {
  apple: process.env.EXPO_PUBLIC_ENABLE_APPLE_AUTH === "true",
  google: process.env.EXPO_PUBLIC_ENABLE_GOOGLE_AUTH === "true"
};

export type NativeAppleCredential = {
  token: string;
  accessToken?: string;
  nonce: string;
};

WebBrowser.maybeCompleteAuthSession();

// Room for a provider password plus two-factor approval on another device.
const oauthSessionTimeoutMs = 300_000;

export const authRedirectUri = () =>
  Platform.OS === "web"
    ? AuthSession.makeRedirectUri({ preferLocalhost: true })
    : AuthSession.makeRedirectUri({ scheme: "equina", path: "auth/callback" });

export const emailAuthRedirectUri = () =>
  Platform.OS === "web"
    ? AuthSession.makeRedirectUri({ preferLocalhost: true, path: "auth/email" })
    : AuthSession.makeRedirectUri({ scheme: "equina", path: "auth/email" });

export const passwordRecoveryRedirectUri = () =>
  Platform.OS === "web"
    ? AuthSession.makeRedirectUri({ preferLocalhost: true, path: "auth/recovery" })
    : AuthSession.makeRedirectUri({ scheme: "equina", path: "auth/recovery" });

export const isEmailAuthCallback = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.pathname.endsWith("/auth/email") ||
      parsed.pathname.endsWith("/auth/recovery") ||
      (parsed.protocol === "equina:" && parsed.host === "auth" && ["/email", "/recovery"].includes(parsed.pathname));
  } catch {
    return false;
  }
};

export const isPasswordRecoveryCallback = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.pathname.endsWith("/auth/recovery") ||
      (parsed.protocol === "equina:" && parsed.host === "auth" && parsed.pathname === "/recovery");
  } catch {
    return false;
  }
};

export async function nativeAppleCredential(): Promise<NativeAppleCredential | null | undefined> {
  if (Platform.OS !== "ios" || !(await AppleAuthentication.isAvailableAsync())) return undefined;

  const rawNonce = Crypto.randomUUID();
  const state = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL
      ],
      nonce: hashedNonce,
      state
    });

    if (credential.state !== state) throw new Error("Apple sign-in state did not match.");
    if (!credential.identityToken) throw new Error("Apple did not return a valid identity token.");

    return {
      token: credential.identityToken,
      accessToken: credential.authorizationCode ?? undefined,
      nonce: rawNonce
    };
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw error;
  }
}

export async function openOAuthSession(url: string, redirectUri: string): Promise<string | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      try {
        WebBrowser.dismissAuthSession();
      } catch {
        // Some Android browsers close the auth tab themselves.
      }
      reject(new Error("Sign-in timed out. Close the provider window and try again."));
    }, oauthSessionTimeoutMs);
  });

  let result;
  try {
    result = await Promise.race([
      WebBrowser.openAuthSessionAsync(url, redirectUri, {
        dismissButtonStyle: "cancel",
        preferEphemeralSession: true
      }),
      timeout
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  if (result.type !== "success") return null;

  const callback = new URL(result.url);
  const providerError = callback.searchParams.get("error_description") ?? callback.searchParams.get("error");
  if (providerError) throw new Error(providerError);

  const code = callback.searchParams.get("code");
  if (!code) throw new Error("The authentication provider did not return a secure authorization code.");
  return code;
}
