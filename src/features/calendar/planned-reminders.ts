import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { PlannedReminder } from "./planned-schedule";
import { notificationRoutes, plannedActivityData } from "../notifications/notification-routes";
import { rideAlertsAllowed } from "../ride/ride-cues";

export { plannedReminders, plannedStart, type PlannedReminder } from "./planned-schedule";

/**
 * A notification when a scheduled activity starts, naming the training and
 * the horse. Rebuilt whenever the list changes: a removed or answered
 * activity loses its reminder, a moved one gets the new time. Three weeks
 * ahead at most, like the training-day reminders. Phones only.
 */

const route = notificationRoutes.plannedActivity;
const channel = "scheduled-activities";

// One rebuild at a time, the newest winning, as in training-reminders.ts.
let queue: Promise<void> = Promise.resolve();
let generation = 0;

async function clearPending() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((request) => request.content.data?.route === route)
        .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined))
    );
  } catch {
    // Nothing scheduled, or nothing to read it with.
  }
}

/**
 * Replaces the pending reminders with these. `ask` asks for notification
 * permission (right after the rider schedules one); otherwise only a phone
 * already allowed gets them.
 */
export function syncPlannedReminders(reminders: PlannedReminder[], ask: boolean) {
  if (Platform.OS === "web") return Promise.resolve();
  const mine = ++generation;
  queue = queue.then(async () => {
    if (mine !== generation) return;
    await clearPending();
    if (reminders.length === 0 || !(await rideAlertsAllowed(ask)) || mine !== generation) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(channel, {
        name: "Scheduled activities",
        importance: Notifications.AndroidImportance.DEFAULT
      }).catch(() => undefined);
    }
    for (const reminder of reminders) {
      if (mine !== generation) return;
      try {
        await Notifications.scheduleNotificationAsync({
          // Its day too: a tap opens the calendar there even once the
          // activity is gone from the list.
          content: { title: reminder.title, body: reminder.body, data: plannedActivityData(reminder) },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: channel }
        });
      } catch {
        // One that could not be scheduled does not stop the others.
      }
    }
  }).catch(() => undefined);
  return queue;
}
