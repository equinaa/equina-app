import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { TrainingPlanDay } from "../../backend";
import { rideAlertsAllowed } from "./ride-cues";

/**
 * A notification on the morning of each planned training day. On by default;
 * the rider turns them off in the plan. The hour is fixed for now.
 *
 * Scheduled as single days, three weeks ahead, rather than as a repeating
 * weekly alarm: a day the rider already logged gets no reminder, and a
 * change to the plan replaces exactly what is pending. They are rebuilt
 * whenever the plan or the journal changes and each time the app opens.
 * Phones only -- a browser cannot wake up to remind anyone.
 */

export const reminderHour = 8;
export const reminderWindowDays = 21;
const reminderRoute = "training-day";
const reminderChannel = "training-days";

export type TrainingReminder = { day: string; planned: TrainingPlanDay[]; title: string; body: string };

/** 08:00 on a local YYYY-MM-DD day. */
export const reminderTime = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1, reminderHour, 0);
};

// Every cancel and schedule runs one after another. Two rebuilds at once
// (the plan saved while the journal reloads) would otherwise each cancel the
// list the other just read, and leave reminders twice or not at all.
let queue: Promise<void> = Promise.resolve();
let generation = 0;
const enqueue = (job: () => Promise<void>) => {
  queue = queue.then(job).catch(() => undefined);
  return queue;
};

async function clearPending() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((request) => request.content.data?.route === reminderRoute)
        .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined))
    );
  } catch {
    // Nothing scheduled, or nothing to read it with.
  }
}

/** On sign-out or when the rider turns them off. */
export function cancelTrainingReminders() {
  if (Platform.OS === "web") return Promise.resolve();
  const mine = ++generation;
  return enqueue(async () => {
    if (mine === generation) await clearPending();
  });
}

/**
 * Replaces the pending reminders with these. `ask` asks for notification
 * permission -- only when the rider saves a plan, never on its own.
 */
export function syncTrainingReminders(reminders: TrainingReminder[], ask: boolean) {
  if (Platform.OS === "web") return Promise.resolve();
  const mine = ++generation;
  return enqueue(async () => {
    // A newer rebuild is queued behind this one: let it do the work.
    if (mine !== generation) return;
    await clearPending();
    if (reminders.length === 0 || !(await rideAlertsAllowed(ask)) || mine !== generation) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(reminderChannel, {
        name: "Training days",
        importance: Notifications.AndroidImportance.DEFAULT
      }).catch(() => undefined);
    }
    const now = Date.now();
    for (const reminder of reminders) {
      if (mine !== generation) return;
      const at = reminderTime(reminder.day);
      if (at.getTime() <= now) continue;
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: reminder.title, body: reminder.body, data: { route: reminderRoute, day: reminder.day } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: reminderChannel }
        });
      } catch {
        // One that could not be scheduled does not stop the others.
      }
    }
  });
}
