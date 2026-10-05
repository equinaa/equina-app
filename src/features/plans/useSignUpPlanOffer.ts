import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const shownKey = (userId: string) => `equina.plans.signup-offer.v1:${userId}`;
// Long enough for the plan and the store's prices to load after arrival;
// short enough that the offer never appears in the middle of something else.
const offerWindowMs = 2 * 60 * 1000;

/**
 * The plan offer after sign-up, once per account and never in the way.
 *
 * Only an account that finished onboarding in this run is a candidate, and
 * only while plans are actually on sale (`ready`). It is marked as shown on
 * this device before it appears, so neither a crash nor a second sign-in
 * brings it back. If plans are not on sale within a couple of minutes of
 * arriving, the candidate lapses: nothing waits for it.
 */
export function useSignUpPlanOffer({ userId, ready }: { userId: string | null; ready: boolean }) {
  const [candidate, setCandidate] = useState<{ userId: string; at: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const userRef = useRef(userId);
  userRef.current = userId;
  const checking = useRef(false);

  useEffect(() => {
    if (!candidate || candidate.userId !== userId || !ready || visible || checking.current) return;
    if (Date.now() - candidate.at > offerWindowMs) {
      setCandidate(null);
      return;
    }
    const accountId = candidate.userId;
    checking.current = true;
    void (async () => {
      try {
        if (await AsyncStorage.getItem(shownKey(accountId))) return;
        await AsyncStorage.setItem(shownKey(accountId), new Date().toISOString());
        if (userRef.current === accountId) setVisible(true);
      } catch {
        // Storage failed: skipping an offer loses nothing.
      } finally {
        checking.current = false;
        setCandidate(null);
      }
    })();
  }, [candidate, ready, userId, visible]);

  // Signing out closes it; it belongs to the account that just arrived.
  useEffect(() => {
    if (!userId) {
      setCandidate(null);
      setVisible(false);
    }
  }, [userId]);

  /** A new account finished onboarding. */
  const offerTo = useCallback((accountId: string) => setCandidate({ userId: accountId, at: Date.now() }), []);
  const dismiss = useCallback(() => setVisible(false), []);

  return { visible, offerTo, dismiss };
}
