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
 * The ride that has had an activity, kept on the phone rather than in memory,
 * from the moment one is shown. iOS often closes a suspended app during a
 * long locked ride, and the rider can swipe the activity away while the app
 * is suspended, with no code running to notice: on the relaunch, a ride kept
 * here with no activity showing had one removed, and it must not come back.
 * One ride at a time, so one id.
 */
export const rideActivityShownKey = "equina.ride-activity-shown.v1";

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
  const shownRide = async () => {
    try {
      return await storage.getItem(rideActivityShownKey);
    } catch {
      return null;
    }
  };
  const keepShown = async (rideId: string) => {
    try {
      await storage.setItem(rideActivityShownKey, rideId);
    } catch {
      // Left in memory only (useRideLiveActivity), as before.
    }
  };
  const forgetShown = async () => {
    try {
      await storage.removeItem(rideActivityShownKey);
    } catch {
      // A later ride has its own id, so an old one left here never matches it.
    }
  };

  /**
   * Shows the ride. With the id of its activity, that one is updated. Without
   * one -- a ride just started, or brought back after the app was closed --
   * the activities still showing are looked at first: the ride's own is taken
   * back (iOS keeps an activity through a force quit), any other is ended, and
   * only then is one started, unless this ride has had one already: then it
   * was swiped away or ended, and stays so.
   */
  const show = (attributes: RideActivityAttributes, content: RideActivityContent, knownId: string | null) =>
    inTurn<ShownRideActivity>(async (module) => {
      const state = JSON.stringify(content.state);
      if (knownId) {
        const updated = await module.update(knownId, state, content.staleDateMs);
        if (updated) return { id: knownId, gone: false };
        await keepShown(attributes.rideId);
        return { id: null, gone: true };
      }
      let id: string | null = null;
      for (const activity of await module.list()) {
        if (activity.rideId === attributes.rideId && id === null) id = activity.id;
        else await module.end(activity.id);
      }
      if (id) {
        await module.update(id, state, content.staleDateMs);
        await keepShown(attributes.rideId);
        return { id, gone: false };
      }
      // This ride had an activity and none is showing, because the rider
      // swiped it away or iOS ended it, possibly while the app was suspended.
      if ((await shownRide()) === attributes.rideId) return { id: null, gone: true };
      if (!supported(module)) return { id: null, gone: false };
      const started = await module.start(JSON.stringify(attributes), state, content.staleDateMs);
      await keepShown(attributes.rideId);
      return { id: started, gone: false };
    }, { id: null, gone: false });

  /** Ends every ride activity at once: the ride is over, or nobody is riding. */
  const endAll = () =>
    inTurn(async (module) => {
      await forgetShown();
      await module.endAll();
    }, undefined);

  return { show, endAll };
}
