import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppState, Linking, Platform } from "react-native";
import {
  getEquinaBackend,
  isBackendConfigured,
  type AccountSnapshot,
  type BackendCapabilities,
  type EquinaBackend,
  type ProfileRecord
} from "../../backend";
import type { Discipline } from "../../domain/types";
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
import { capabilitiesStale, effectiveCapabilities, emptyCapabilities } from "./session-capabilities";

/** Why the rider is looking at the sign-in screen, when they did not choose to. */
export type SignedOutNotice = "expired" | "linkFailed";

export type SessionPhase =
  | "restoring"
  | "signedOut"
  | "onboarding"
  | "authenticated"
  | "recoverableError"
  | "demo";

// The URL the app was opened with, if any. On the web that is the page itself.
const initialAuthUrl = async () =>
  Platform.OS === "web"
    ? typeof window !== "undefined" ? window.location.href : null
    : Linking.getInitialURL();

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
  const [signedOutNotice, setSignedOutNotice] = useState<SignedOutNotice | null>(null);
  const processedEmailLinks = useRef(new Set<string>());
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // Marks a sign-out the rider asked for, so the SIGNED_OUT event it causes is
  // not reported to them as an expired session.
  const voluntarySignOut = useRef(false);
  // While an emailed link is being exchanged, it owns the phase. A restore
  // finishing in the meantime would otherwise show the sign-in screen, or
  // worse, overwrite the session the link just created.
  const emailLinkInFlight = useRef(false);
  const initialLinkChecked = useRef(false);
  // When the server last said what this session may do. Coming back to the
  // app asks again once it is old enough.
  const capabilitiesLoadedAt = useRef(0);

  const applyCapabilities = useCallback((server: BackendCapabilities) => {
    const next = effectiveCapabilities(server);
    capabilitiesLoadedAt.current = Date.now();
    setCapabilities(next);
    return next;
  }, []);

  const acceptsEmailLink = useCallback(
    (url: string) => Boolean(backend) && emailAuthMode === "magic-link" && isEmailAuthCallback(url),
    [backend]
  );

  const loadAuthenticatedState = useCallback(async (
    targetSession: Session,
    nextCapabilities?: BackendCapabilities
  ) => {
    if (!backend) throw new Error("Backend is not configured.");
    const snapshot = await backend.account.snapshot();
    setSession(targetSession);
    setAccount(snapshot);
    if (nextCapabilities) applyCapabilities(nextCapabilities);
    setError("");
    setPhase(snapshot.profile.onboardingCompletedAt ? "authenticated" : "onboarding");
    return snapshot;
  }, [applyCapabilities, backend]);

  const restore = useCallback(async () => {
    if (!backend) {
      setPhase("signedOut");
      return;
    }
    setPhase("restoring");
    // Opened from an emailed link: the link listener below exchanges it and
    // decides the phase. Settling on "signed out" first would flash the
    // sign-in screen at someone who is one step from being signed in.
    if (!initialLinkChecked.current) {
      initialLinkChecked.current = true;
      const initialUrl = await initialAuthUrl().catch(() => null);
      if (initialUrl && acceptsEmailLink(initialUrl)) return;
    }
    try {
      const connected = await backend.connect();
      if (emailLinkInFlight.current) return;
      applyCapabilities(connected.capabilities);
      if (!connected.session) {
        setSession(null);
        setAccount(null);
        setPhase("signedOut");
        return;
      }
      await loadAuthenticatedState(connected.session, connected.capabilities);
    } catch {
      if (emailLinkInFlight.current) return;
      setError("Equina could not restore your session. Check your connection and try again.");
      setPhase("recoverableError");
    }
  }, [acceptsEmailLink, applyCapabilities, backend, loadAuthenticatedState]);

  /**
   * Asks the server again what this session may do. Capabilities were only
   * read at sign-in, sign-up and restore, so an invite, a revoke or a flag
   * changed for one person waited for the app to be closed and reopened.
   * The beta door's "Check again" is this.
   */
  const refreshCapabilities = useCallback(async () => {
    if (!backend) return null;
    const connected = await backend.connect();
    // Signed out, or signed into another way, while the answer was on its way:
    // it belongs to a session that is gone.
    const signedIn = phaseRef.current === "authenticated" || phaseRef.current === "onboarding";
    if (!signedIn || !connected.session) return null;
    return applyCapabilities(connected.capabilities);
  }, [applyCapabilities, backend]);

  // Back in the foreground, a signed-in session asks again -- at most once a
  // minute, so switching apps back and forth does not call the server each time.
  useEffect(() => {
    if (!backend || !session) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !capabilitiesStale(capabilitiesLoadedAt.current, Date.now())) return;
      // A failed refresh keeps what the session already had.
      void refreshCapabilities().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [backend, refreshCapabilities, session]);

  useEffect(() => {
    void restore();
    if (!backend) return;
    return backend.auth.onChange((event, nextSession) => {
      // The first restore decides the starting phase; this event only repeats
      // what it is already reading.
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT" || !nextSession) {
        // A refresh token revoked elsewhere, or an account removed, ends the
        // session without the rider doing anything. Say so.
        const wasSignedIn = phaseRef.current === "authenticated" || phaseRef.current === "onboarding";
        if (!voluntarySignOut.current && wasSignedIn) setSignedOutNotice("expired");
        setSession(null);
        setAccount(null);
        setCapabilities(emptyCapabilities);
        setRecoveryRequired(false);
        setPhase("signedOut");
      } else if (
        event === "TOKEN_REFRESHED" &&
        (phaseRef.current === "authenticated" || phaseRef.current === "onboarding")
      ) {
        // Only a live session takes a refreshed token. One that arrives after
        // sign-out must not quietly re-attach the old account.
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
    const snapshot = await loadAuthenticatedState(verified, connected.capabilities);
    return { session: verified, snapshot };
  }, [backend, loadAuthenticatedState]);

  // A reset code signs the rider in for one purpose: choosing a new password.
  // The recovery screen stays in front until they do.
  const verifyRecoveryCode = useCallback(async (email: string, code: string) => {
    if (!backend) throw new Error("Backend is not configured.");
    const verified = await backend.auth.verifyRecoveryCode(email, code);
    const connected = await backend.connect();
    await loadAuthenticatedState(verified, connected.capabilities);
    setRecoveryRequired(true);
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
    if (!backend || !acceptsEmailLink(url)) return false;
    if (processedEmailLinks.current.has(url)) return true;
    // Someone already signed in has nothing to exchange a sign-in link for, and
    // a forged one must not knock them out of the app. A reset link still
    // applies: it is how a signed-in rider changes a forgotten password.
    const signedIn = phaseRef.current === "authenticated" || phaseRef.current === "onboarding";
    if (signedIn && !isPasswordRecoveryCallback(url)) return false;
    processedEmailLinks.current.add(url);
    emailLinkInFlight.current = true;
    setSignedOutNotice(null);
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
      // Retrying cannot help: the exchange already consumed the one-time
      // verifier on this device. Return to wherever the rider was, and on the
      // sign-in screen say why the link did nothing.
      setSignedOutNotice("linkFailed");
      emailLinkInFlight.current = false;
      await restore();
      return false;
    } finally {
      emailLinkInFlight.current = false;
    }
  }, [acceptsEmailLink, backend, loadAuthenticatedState, restore]);

  const completePasswordRecovery = useCallback(async (password: string) => {
    if (!backend || !session) throw new Error("Recovery session is no longer valid.");
    await backend.auth.setPassword(password);
    setRecoveryRequired(false);
  }, [backend, session]);

  useEffect(() => {
    if (emailAuthMode !== "magic-link") return;
    let active = true;
    const handleUrl = async (url: string | null) => {
      if (!active || !url || !acceptsEmailLink(url)) return;
      await completeEmailLink(url);
    };

    void initialAuthUrl().then(handleUrl, () => undefined);
    const subscription = Linking.addEventListener("url", ({ url }) => void handleUrl(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [acceptsEmailLink, completeEmailLink]);

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
    voluntarySignOut.current = true;
    try {
      if (backend) {
        if (session && capabilities.pushNotifications) {
          await backend.notifications.revokeAll().catch(() => undefined);
        }
        // Runs without a loaded session too: "Sign in with a different
        // account" on the reconnect screen must clear the stored session that
        // failed to restore. Offline, the local session is still removed and
        // the server-side token expires on its own.
        await backend.auth.signOut().catch(() => undefined);
      }
    } finally {
      voluntarySignOut.current = false;
      setSession(null);
      setAccount(null);
      setCapabilities(emptyCapabilities);
      setRecoveryRequired(false);
      setSignedOutNotice(null);
      setError("");
      setPhase("signedOut");
    }
  }, [backend, capabilities.pushNotifications, session]);

  const clearSignedOutNotice = useCallback(() => setSignedOutNotice(null), []);

  return {
    backend,
    configured,
    demoAllowed,
    phase,
    session,
    account,
    capabilities,
    recoveryRequired,
    signedOutNotice,
    clearSignedOutNotice,
    error,
    restore,
    refreshCapabilities,
    sendCode,
    verifyCode,
    verifyRecoveryCode,
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
