import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Linking, Platform } from "react-native";
import {
  getEquinaBackend,
  isBackendConfigured,
  type AccountSnapshot,
  type BackendCapabilities,
  type EquinaBackend,
  type ProfileRecord
} from "../../backend";
import type { Discipline } from "../../domain/types";
import { equinaFeatureFlags } from "../../config/feature-flags";
import {
  authRedirectUri,
  emailAuthMode,
  emailAuthRedirectUri,
  isEmailAuthCallback,
  isPasswordRecoveryCallback,
  nativeAppleCredential,
  openOAuthSession,
  passwordRecoveryRedirectUri,
  type SocialAuthProvider
} from "./social-auth";

export type SessionPhase =
  | "restoring"
  | "signedOut"
  | "onboarding"
  | "authenticated"
  | "recoverableError"
  | "demo";

const emptyCapabilities: BackendCapabilities = {
  auth: false,
  accountSettings: false,
  coachChat: false,
  pushNotifications: false,
  records: false,
  horseManagement: false,
  rideLogging: false,
  clubPublishing: false,
  clubInteractions: false,
  listingCreation: false,
  messaging: false,
  checkout: false
};

const effectiveCapabilities = (server: BackendCapabilities): BackendCapabilities => ({
  ...server,
  accountSettings: server.accountSettings && equinaFeatureFlags.accountSettings,
  coachChat: server.coachChat && equinaFeatureFlags.coachChat,
  pushNotifications: server.pushNotifications && equinaFeatureFlags.pushNotifications,
  records: server.records && equinaFeatureFlags.recordMutations,
  horseManagement: server.horseManagement && equinaFeatureFlags.horseManagement,
  rideLogging: server.rideLogging && equinaFeatureFlags.rideLogging,
  clubPublishing: server.clubPublishing && equinaFeatureFlags.clubPublishing,
  clubInteractions: server.clubInteractions && equinaFeatureFlags.clubInteractions,
  listingCreation: server.listingCreation && equinaFeatureFlags.shopListingCreation,
  messaging: server.messaging && equinaFeatureFlags.shopMessaging
});

export function useEquinaSession() {
  const configured = isBackendConfigured();
  const demoAllowed =
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_EQUINA_DEMO_MODE === "true";
  const backend = useMemo<EquinaBackend | null>(
    () => configured ? getEquinaBackend() : null,
    [configured]
  );
  const [phase, setPhase] = useState<SessionPhase>(configured ? "restoring" : "signedOut");
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [capabilities, setCapabilities] = useState<BackendCapabilities>(emptyCapabilities);
  const [error, setError] = useState("");
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const processedEmailLinks = useRef(new Set<string>());

  const loadAuthenticatedState = useCallback(async (
    targetSession: Session,
    nextCapabilities?: BackendCapabilities
  ) => {
    if (!backend) throw new Error("Backend is not configured.");
    const snapshot = await backend.account.snapshot();
    setSession(targetSession);
    setAccount(snapshot);
    if (nextCapabilities) setCapabilities(effectiveCapabilities(nextCapabilities));
    setError("");
    setPhase(snapshot.profile.onboardingCompletedAt ? "authenticated" : "onboarding");
    return snapshot;
  }, [backend]);

  const restore = useCallback(async () => {
    if (!backend) {
      setPhase("signedOut");
      return;
    }
    setPhase("restoring");
    try {
      const connected = await backend.connect();
      setCapabilities(effectiveCapabilities(connected.capabilities));
      if (!connected.session) {
        setSession(null);
        setAccount(null);
        setPhase("signedOut");
        return;
      }
      await loadAuthenticatedState(connected.session, connected.capabilities);
    } catch {
      setError("Equina could not restore your session. Check your connection and try again.");
      setPhase("recoverableError");
    }
  }, [backend, loadAuthenticatedState]);

  useEffect(() => {
    void restore();
    if (!backend) return;
    return backend.auth.onChange((event, nextSession) => {
      if (event === "SIGNED_OUT" || !nextSession) {
        setSession(null);
        setAccount(null);
        setCapabilities(emptyCapabilities);
        setRecoveryRequired(false);
        setPhase("signedOut");
      } else if (event === "TOKEN_REFRESHED") {
        setSession(nextSession);
      }
    });
  }, [backend, restore]);

  const sendCode = useCallback(async (email: string, displayName?: string, shouldCreateUser = true) => {
    if (!backend) throw new Error("Backend is not configured.");
    await backend.auth.sendEmailCode(
      email,
      displayName,
      shouldCreateUser,
      emailAuthMode === "magic-link" ? emailAuthRedirectUri() : undefined
    );
  }, [backend]);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!backend) throw new Error("Backend is not configured.");
    const verified = await backend.auth.verifyEmailCode(email, code);
    const connected = await backend.connect();
    await loadAuthenticatedState(verified, connected.capabilities);
    return verified;
  }, [backend, loadAuthenticatedState]);

  const createPasswordAccount = useCallback(async (
    email: string,
    password: string,
    displayName?: string
  ) => {
    if (!backend) throw new Error("Backend is not configured.");
    const createdSession = await backend.auth.signUpWithPassword({
      email,
      password,
      displayName,
      redirectTo: emailAuthRedirectUri()
    });
    if (!createdSession) return { verificationRequired: true as const, snapshot: null };
    const connected = await backend.connect();
    const snapshot = await loadAuthenticatedState(createdSession, connected.capabilities);
    return { verificationRequired: false as const, snapshot };
  }, [backend, loadAuthenticatedState]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!backend) throw new Error("Backend is not configured.");
    const authenticatedSession = await backend.auth.signInWithPassword(email, password);
    const connected = await backend.connect();
    const snapshot = await loadAuthenticatedState(authenticatedSession, connected.capabilities);
    return { session: authenticatedSession, snapshot };
  }, [backend, loadAuthenticatedState]);

  const requestPasswordRecovery = useCallback(async (email: string) => {
    if (!backend) throw new Error("Backend is not configured.");
    await backend.auth.requestPasswordReset(email, passwordRecoveryRedirectUri());
  }, [backend]);

  const continueWithProvider = useCallback(async (provider: SocialAuthProvider) => {
    if (!backend) throw new Error("Backend is not configured.");

    let authenticatedSession: Session | null = null;
    if (provider === "apple") {
      const credential = await nativeAppleCredential();
      if (credential === null) return null;
      if (credential) {
        authenticatedSession = await backend.auth.signInWithIdToken({
          provider,
          token: credential.token,
          accessToken: credential.accessToken,
          nonce: credential.nonce
        });
      }
    }

    if (!authenticatedSession) {
      const redirectUri = authRedirectUri();
      const authorizationUrl = await backend.auth.beginOAuth(provider, redirectUri);
      const code = await openOAuthSession(authorizationUrl, redirectUri);
      if (!code) return null;
      authenticatedSession = await backend.auth.exchangeOAuthCode(code);
    }

    const connected = await backend.connect();
    const snapshot = await loadAuthenticatedState(authenticatedSession, connected.capabilities);
    return { session: authenticatedSession, snapshot };
  }, [backend, loadAuthenticatedState]);

  const setPassword = useCallback(async (password: string) => {
    if (!backend) throw new Error("Backend is not configured.");
    await backend.auth.setPassword(password);
  }, [backend]);

  const completeEmailLink = useCallback(async (url: string) => {
    if (!backend || emailAuthMode !== "magic-link" || !isEmailAuthCallback(url)) return false;
    if (processedEmailLinks.current.has(url)) return true;
    processedEmailLinks.current.add(url);
    setPhase("restoring");
    try {
      const verified = await backend.auth.exchangeEmailLink(url);
      const connected = await backend.connect();
      await loadAuthenticatedState(verified, connected.capabilities);
      setRecoveryRequired(isPasswordRecoveryCallback(url));
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.history.replaceState({}, "", "/");
      }
      return true;
    } catch {
      processedEmailLinks.current.delete(url);
      setError("That secure email link is invalid or expired. Request a new one and try again.");
      setPhase("recoverableError");
      return false;
    }
  }, [backend, loadAuthenticatedState]);

  const completePasswordRecovery = useCallback(async (password: string) => {
    if (!backend || !session) throw new Error("Recovery session is no longer valid.");
    await backend.auth.setPassword(password);
    setRecoveryRequired(false);
  }, [backend, session]);

  useEffect(() => {
    if (emailAuthMode !== "magic-link") return;
    let active = true;
    const handleUrl = async (url: string | null) => {
      if (!active || !url || !isEmailAuthCallback(url)) return;
      await completeEmailLink(url);
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      void handleUrl(window.location.href);
    } else {
      void Linking.getInitialURL().then(handleUrl);
    }
    const subscription = Linking.addEventListener("url", ({ url }) => void handleUrl(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [completeEmailLink]);

  const completeOnboarding = useCallback(async (input: {
    displayName: string;
    locale: string;
    discipline: Discipline;
    skillLevel: NonNullable<ProfileRecord["skillLevel"]>;
    horseName?: string;
    horseBreed?: string;
    horsePhotoPath?: string;
  }) => {
    if (!backend) throw new Error("Verify your email before completing setup.");
    const activeSession = session ?? await backend.auth.session();
    if (!activeSession) throw new Error("Verify your email before completing setup.");
    setSession(activeSession);
    await backend.account.completeOnboarding(input);
    const snapshot = await backend.account.snapshot();
    setAccount(snapshot);
    setPhase("authenticated");
    return snapshot;
  }, [backend, session]);

  const refreshAccount = useCallback(async () => {
    if (!backend || !session) return null;
    const snapshot = await backend.account.snapshot();
    setAccount(snapshot);
    return snapshot;
  }, [backend, session]);

  const updateAccount = useCallback((next: AccountSnapshot) => {
    setAccount(next);
  }, []);

  const enterDemo = useCallback(() => {
    if (!demoAllowed) return;
    setAccount(null);
    setSession(null);
    setCapabilities(emptyCapabilities);
    setError("");
    setPhase("demo");
  }, [demoAllowed]);

  const signOut = useCallback(async () => {
    if (backend && session) {
      if (capabilities.pushNotifications) {
        await backend.notifications.revokeAll().catch(() => undefined);
      }
      await backend.auth.signOut();
    }
    setSession(null);
    setAccount(null);
    setCapabilities(emptyCapabilities);
    setRecoveryRequired(false);
    setPhase("signedOut");
  }, [backend, capabilities.pushNotifications, session]);

  return {
    backend,
    configured,
    demoAllowed,
    phase,
    session,
    account,
    capabilities,
    recoveryRequired,
    error,
    restore,
    sendCode,
    verifyCode,
    createPasswordAccount,
    signInWithPassword,
    requestPasswordRecovery,
    completePasswordRecovery,
    continueWithProvider,
    setPassword,
    completeEmailLink,
    emailAuthMode,
    completeOnboarding,
    refreshAccount,
    updateAccount,
    enterDemo,
    signOut
  };
}
