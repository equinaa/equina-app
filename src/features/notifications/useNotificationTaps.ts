import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { createTapLedger, readNotificationTap, showsWhileOpen, type NotificationTap } from "./notification-routes";

// Outside React, so a remount (Try again on the error screen) does not open
// the same tap a second time.
const firstTimeSeen = createTapLedger();

/**
 * Every tap on an Equina notification, handed to `onTap` once each. The
 * listener hears taps while the app is running; a tap that launched the app
 * from closed came before any listener existed, and only the last response
 * still has it, so it is read once on mount. Phones only.
 *
 * While the app is open the reminders show as banners and everything else
 * stays silent (`showsWhileOpen`); during a ride nothing shows.
 */
export function useNotificationTaps({ onTap, rideRunning }: { onTap: (tap: NotificationTap) => void; rideRunning: boolean }) {
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const rideRunningRef = useRef(rideRunning);
  rideRunningRef.current = rideRunning;

  useEffect(() => {
    if (Platform.OS === "web") return;
    const deliver = (response: Notifications.NotificationResponse | null) => {
      const tap = readNotificationTap(response);
      if (!tap || !firstTimeSeen(tap.key)) return;
      try {
        // Handled: a later read of the last response must not bring it back.
        Notifications.clearLastNotificationResponse();
      } catch {
        // An older native module without it; the ledger still holds the key.
      }
      onTapRef.current(tap);
    };
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const show = showsWhileOpen(notification.request.content.data, rideRunningRef.current);
        return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
      }
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(deliver);
    try {
      deliver(Notifications.getLastNotificationResponse());
    } catch {
      // Nothing to read it with: only taps from now on are heard.
    }
    return () => {
      subscription.remove();
      Notifications.setNotificationHandler(null);
    };
  }, []);
}
