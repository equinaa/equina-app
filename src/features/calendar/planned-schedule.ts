import type { PlannedActivity } from "../../backend";

/** How far ahead reminders are set, like the training-day reminders. */
export const plannedReminderWindowDays = 21;

export type PlannedReminder = { id: string; at: Date; title: string; body: string };

/** The local start of a scheduled activity. */
export const plannedStart = (activity: Pick<PlannedActivity, "day" | "startMinutes">) => {
  const [year, month, date] = activity.day.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1, 0, activity.startMinutes);
};

/** The reminders for these activities: the planned ones still to start, within three weeks. */
export const plannedReminders = (
  activities: readonly PlannedActivity[],
  describe: (activity: PlannedActivity) => { title: string; body: string },
  now: number
): PlannedReminder[] =>
  activities
    .filter((activity) => activity.status === "planned")
    .map((activity) => ({ activity, at: plannedStart(activity) }))
    .filter(({ at }) => at.getTime() > now && at.getTime() <= now + plannedReminderWindowDays * 24 * 60 * 60 * 1000)
    .map(({ activity, at }) => ({ id: activity.id, at, ...describe(activity) }));
