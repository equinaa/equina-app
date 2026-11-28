import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { RideActivityAttributes, RideActivityContent } from "./ride-live-activity";

/**
 * The phone side of the ride's Live Activity: the app's own Expo module in
 * modules/ride-activity. Only an iPhone has one, and only a build made after
 * it was added: everywhere else every call here does nothing.
 */

type NativeRideActivity = {
  isSupported(): boolean;
  start(attributesJson: string, stateJson: string, staleDateMs: number | null): Promise<string>;
  update(id: string, stateJson: string, staleDateMs: number | null): Promise<boolean>;
  end(id: string): Promise<void>;
  list(): Promise<{ id: string; rideId: string }[]>;
  endAll(): Promise<void>;
};

// Asked of Expo, never required: a build from before the module has none,
// and a native module that fails to load at run time is fatal under Metro,
// past any try/catch (see useVoiceInput.ts). Looked up once.
let loaded: NativeRideActivity | null | undefined;
const rideActivityModule = (): NativeRideActivity | null => {
  if (loaded !== undefined) return loaded;
  if (Platform.OS !== "ios") return (loaded = null);
  try {
    loaded = requireOptionalNativeModule<NativeRideActivity>("RideActivity");
  } catch {
    loaded = null;
  }
  return loaded;
};

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
  const module = rideActivityModule();
  if (!module) return Promise.resolve(fallback);
  const next = queue.then(() => job(module)).catch(() => fallback);
  queue = next;
  return next;
};

export type ShownRideActivity = {
  /** The activity showing the ride, or null when none could be shown. */
  id: string | null;
  /** The activity this ride had is gone: the rider swiped it away, or iOS ended it. */
  gone: boolean;
};

/**
 * Shows the ride. With the id of its activity, that one is updated. Without
 * one -- a ride just started, or brought back after the app was closed --
 * the activities still showing are looked at first: the ride's own is taken
 * back (iOS keeps an activity through a force quit), any other is ended, and
 * only then is one started.
 */
export const showRideActivity = (
  attributes: RideActivityAttributes,
  content: RideActivityContent,
  knownId: string | null
) =>
  inTurn<ShownRideActivity>(async (module) => {
    const state = JSON.stringify(content.state);
    if (knownId) {
      const updated = await module.update(knownId, state, content.staleDateMs);
      return { id: updated ? knownId : null, gone: !updated };
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
    if (!supported(module)) return { id: null, gone: false };
    return { id: await module.start(JSON.stringify(attributes), state, content.staleDateMs), gone: false };
  }, { id: null, gone: false });

/** Ends every ride activity at once: the ride is over, or nobody is riding. */
export const endRideActivities = () => inTurn((module) => module.endAll(), undefined);
