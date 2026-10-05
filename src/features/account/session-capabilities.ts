import type { BackendCapabilities } from "../../backend/contracts";
import { equinaFeatureFlags } from "../../config/feature-flags";
import type { SessionPhase } from "./useEquinaSession";

// What the app may do for the session it holds. Kept apart from the session
// hook, which pulls in React Native, so the Node tests can read these rules.

/** Signed out, in the demo, or before the server answers: nothing is on. */
export const emptyCapabilities: BackendCapabilities = {
  auth: false,
  // The beta door only matters to a signed-in account (202610060003); the
  // demo and the sign-in screen are never behind it.
  appAccess: true,
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
  checkout: false,
  purchases: false
};

/** The server's answer, narrowed by this build's own switches. */
export const effectiveCapabilities = (server: BackendCapabilities): BackendCapabilities => {
  // A server from before the beta door sends no such field. It enforces no
  // door either, so there is nothing to wait outside of.
  const appAccess = server.appAccess !== false;
  return {
    ...server,
    appAccess,
    accountSettings: server.accountSettings && equinaFeatureFlags.accountSettings,
    coachChat: server.coachChat && equinaFeatureFlags.coachChat,
    pushNotifications: server.pushNotifications && equinaFeatureFlags.pushNotifications,
    records: server.records && equinaFeatureFlags.recordMutations,
    horseManagement: server.horseManagement && equinaFeatureFlags.horseManagement,
    rideLogging: server.rideLogging && equinaFeatureFlags.rideLogging,
    clubPublishing: server.clubPublishing && equinaFeatureFlags.clubPublishing,
    clubInteractions: server.clubInteractions && equinaFeatureFlags.clubInteractions,
    listingCreation: server.listingCreation && equinaFeatureFlags.shopListingCreation,
    messaging: server.messaging && equinaFeatureFlags.shopMessaging,
    // A server from before purchases existed sends no such field: off. Nothing
    // is sold to an account that is still outside the beta.
    purchases: server.purchases === true && appAccess
  };
};

/**
 * The beta door stands in front of onboarding and the app for a signed-in
 * account the server has not let in. Never for the demo, a signed-out visitor
 * or a session still restoring: their capabilities say nothing about the door.
 */
export const showsBetaDoor = (phase: SessionPhase, capabilities: Pick<BackendCapabilities, "appAccess">) =>
  (phase === "onboarding" || phase === "authenticated") && !capabilities.appAccess;

/** How often coming back to the app may ask the server again. */
export const capabilityRefreshIntervalMs = 60 * 1000;

/** Coming back to the app asks again only when the last answer is old enough. */
export const capabilitiesStale = (lastLoadedAt: number, now: number) =>
  now - lastLoadedAt >= capabilityRefreshIntervalMs;
