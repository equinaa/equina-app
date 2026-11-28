import type { RideActivityAttributes, RideActivityContent } from "./ride-live-activity";

/**
 * What the app asks of the ride's Live Activity, apart from where the native
 * module and the phone's storage come from (ride-activity-native.ts), so the
 * tests can run it with fakes of both.
 */

export type NativeRideActivity = {
  isSupported(): boolean;
  start(attributesJson: string, stateJson: string, staleDateMs: number | null): Promise<string>;
  update(id: string, stateJson: string, staleDateMs: number | null): Promise<boolean>;
  end(id: string): Promise<void>;
  list(): Promise<{ id: string; rideId: string }[]>;
  endAll(): Promise<void>;
};

/** The part of AsyncStorage used here. */
export type RideActivityStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type ShownRideActivity = {
  /** The activity showing the ride, or null when none could be shown. */
  id: string | null;
  /** The activity this ride had is gone: the rider swiped it away, or iOS ended it. */
  gone: boolean;
};

/**
 * The ride whose activity the rider swiped away, or iOS ended, kept on the
 * phone rather than in memory: iOS often closes a suspended app during a long
 * locked ride, and the activity the rider removed must not come back when the
 * ride does. One ride at a time, so one id.
 */
export const rideActivityDismissedKey = "equina.ride-activity-dismissed.v1";

export function createRideActivityCalls(nativeModule: () => NativeRideActivity | null, storage: RideActivityStorage) {
  /** iOS 16.2 or later, with Live Activities on for Equina. Asked each time: the rider can turn them off. */
  const supported = (module: NativeRideActivity) => {
    try {
      return module.isSupported();
    } catch {
      return false;
    }
  };

  // One call at a time, in the order asked: an end asked while a start is
  // still on its way ends that activity too, and a relaunch's look at what is
  // showing is never split by another call.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(job: (module: NativeRideActivity) => Promise<T>, fallback: T): Promise<T> => {
    const module = nativeModule();
    if (!module) return Promise.resolve(fallback);
    const next = queue.then(() => job(module)).catch(() => fallback);
    queue = next;
    return next;
  };

  // Storage that fails costs only this: an activity swiped away may come
  // back after a relaunch. It never stops the call it is part of.
  const dismissedRide = async () => {
    try {
      return await storage.getItem(rideActivityDismissedKey);
    } catch {
      return null;
    }
  };
  const keepDismissed = async (rideId: string) => {
    try {
      await storage.setItem(rideActivityDismissedKey, rideId);
    } catch {
      // Left in memory only (useRideLiveActivity), as before.
    }
  };
  const forgetDismissed = async () => {
    try {
      await storage.removeItem(rideActivityDismissedKey);
    } catch {
      // A later ride has its own id, so an old one left here never matches it.
    }
  };

  /**
   * Shows the ride. With the id of its activity, that one is updated. Without
   * one -- a ride just started, or brought back after the app was closed --
   * the activities still showing are looked at first: the ride's own is taken
   * back (iOS keeps an activity through a force quit), any other is ended, and
   * only then is one started, unless the rider had already swiped this ride's
   * away.
   */
  const show = (attributes: RideActivityAttributes, content: RideActivityContent, knownId: string | null) =>
    inTurn<ShownRideActivity>(async (module) => {
      const state = JSON.stringify(content.state);
      if (knownId) {
        const updated = await module.update(knownId, state, content.staleDateMs);
        if (updated) return { id: knownId, gone: false };
        await keepDismissed(attributes.rideId);
        return { id: null, gone: true };
      }
      let id: string | null = null;
      for (const activity of await module.list()) {
        if (activity.rideId === attributes.rideId && id === null) id = activity.id;
        else await module.end(activity.id);
      }
      if (id) {
        await module.update(id, state, content.staleDateMs);
        return { id, gone: false };
      }
      if ((await dismissedRide()) === attributes.rideId) return { id: null, gone: true };
      if (!supported(module)) return { id: null, gone: false };
      return { id: await module.start(JSON.stringify(attributes), state, content.staleDateMs), gone: false };
    }, { id: null, gone: false });

  /** Ends every ride activity at once: the ride is over, or nobody is riding. */
  const endAll = () =>
    inTurn(async (module) => {
      await forgetDismissed();
      await module.endAll();
    }, undefined);

  return { show, endAll };
}
