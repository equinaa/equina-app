import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { createRideActivityCalls, type NativeRideActivity } from "./ride-activity-calls";

export type { ShownRideActivity } from "./ride-activity-calls";

/**
 * The phone side of the ride's Live Activity: the app's own Expo module in
 * modules/ride-activity. Only an iPhone has one, and only a build made after
 * it was added: everywhere else every call here does nothing. What the calls
 * do is in ride-activity-calls.ts.
 */

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

const onThisPhone = createRideActivityCalls(rideActivityModule, AsyncStorage);

/**
 * Shows the ride: updates its activity, takes it back after a relaunch, or
 * starts one, unless the rider swiped this ride's away (kept on the phone).
 */
export const showRideActivity = onThisPhone.show;

/** Ends every ride activity at once: the ride is over, or nobody is riding. */
export const endRideActivities = onThisPhone.endAll;
