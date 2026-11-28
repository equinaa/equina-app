import type { PlannedActivity, TrainingPlanDay } from "../../backend/contracts";
import { dayHeading } from "../../domain/activity-calendar";
import { localDayOf } from "../../domain/local-day";
import { formatActivityTime } from "../ride/ride-plan";

/**
 * What a tapped notification opens. Every notification Equina shows carries
 * a `route` in its data, and this file is the one place that reads it back:
 * the reminders and the ride alerts write it, a tap is parsed here, and the
 * screen it leads to is decided here, so App.tsx only carries it out.
 *
 * Nothing here imports React Native, so the tests can run all of it.
 *
 * A tap always keeps the notification's own words. iOS removes a tapped
 * notification from Notification Center, so the app is the only place left
 * that can say what it was about -- even when what it named has changed
 * since (ridden, removed) or cannot be read (offline at the yard).
 */

export const notificationRoutes = {
  /** The 08:00 reminder on a planned training day (training-reminders.ts). */
  trainingDay: "training-day",
  /** A scheduled activity's start (planned-reminders.ts). */
  plannedActivity: "planned-activity",
  /** A phase change during a ride, for a locked phone (ride-cues.ts). */
  ridePhase: "ride-phase",
  /** A Shop message, pushed by the server (process-notification-outbox). */
  shopConversation: "shop-conversation"
} as const;

export type NotificationRoute = (typeof notificationRoutes)[keyof typeof notificationRoutes];

/** A plain tap on the notification, as expo-notifications names it. Other actions are not taps. */
export const defaultTapAction = "expo.modules.notifications.actions.DEFAULT";

/** As much of expo-notifications' NotificationResponse as is read here. */
export type NotificationResponseLike = {
  actionIdentifier?: string;
  notification?: {
    /** When it was delivered: milliseconds on Android, seconds on iOS. */
    date?: number;
    request?: {
      identifier?: string;
      content?: { title?: string | null; body?: string | null; data?: Record<string, unknown> | null };
    };
  };
};

/** A ride the reminder named: the training, on the horse if there is one. */
export type RemindedRide = { horseId?: string; trainingType: string };

type TapBase = {
  /** The same tap read twice (the listener and the last response) has the same key. */
  key: string;
  title: string;
  body: string;
};

export type NotificationTap = TapBase & (
  | {
      route: "training-day";
      /** The reminder's day; from when it was delivered for a reminder scheduled before it carried one. */
      day?: string;
      /** The horses it named, first to last. Empty in a reminder from before it carried them. */
      horseIds: string[];
      rides: RemindedRide[];
    }
  | { route: "planned-activity"; id: string; day?: string }
  | { route: "ride-phase" }
  | { route: "shop-conversation"; conversationId: string }
  | { route: "unknown" }
);

/** The words of the notification, shown where the tap lands. */
export type TapNotice = {
  title: string;
  body: string;
  /** What has happened since, or what the app cannot tell, in a few words. */
  detail?: string;
  /** The day it is about: the calendar shows it only on that day. */
  day?: string;
};

export type TapTarget =
  | { screen: "ride" }
  | { screen: "rideSetup"; horseId?: string; trainingType: string; notice: TapNotice }
  | { screen: "calendar"; day: string; focusId?: string; notice: TapNotice }
  | { screen: "shopConversation"; conversationId: string }
  | { screen: "home"; notice: TapNotice }
  /** Nothing to open or to say: the app opens where it was. */
  | { screen: "stay" };

export type TapContext = {
  /** The local day, YYYY-MM-DD. */
  today: string;
  /** A ride is running: it stays in front. */
  rideActive: boolean;
  /** The calendar can open (ride logging is on for the account). */
  calendar: boolean;
  /**
   * A day of the rider's training plan, the way the reminders read it: what
   * their own horses have planned, and what is still to ride. Null while the
   * plan or the horse list is not in (offline, still loading).
   */
  planOn: ((day: string) => { planned: readonly TrainingPlanDay[]; due: readonly TrainingPlanDay[] }) | null;
  /** The scheduled activities as loaded; `complete` is false when the last read failed. Null while unknown. */
  planned: {
    items: readonly PlannedActivity[];
    complete: boolean;
    /** The first day the list covers: older activities are not in it, so their absence proves nothing. */
    since?: string;
  } | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const textOf = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

// iOS reports the delivery time in seconds and Android in milliseconds. Any
// time this app sees is far past 1973 in milliseconds and far before 5138 in
// seconds, so the size says which.
const deliveredDay = (date: unknown) => {
  if (typeof date !== "number" || !Number.isFinite(date) || date <= 0) return undefined;
  return localDayOf(date < 1e11 ? date * 1000 : date) ?? undefined;
};

const remindedRides = (value: unknown): RemindedRide[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.trainingType !== "string" || !entry.trainingType) return [];
        return [typeof entry.horseId === "string" && entry.horseId
          ? { horseId: entry.horseId, trainingType: entry.trainingType }
          : { trainingType: entry.trainingType }];
      })
    : [];

/**
 * The tap in a notification response, or null when it is not a plain tap (a
 * dismissal, an action button). Never throws: whatever the data holds, the
 * title and the body stay, and data it cannot place is `unknown`.
 */
export function readNotificationTap(response: NotificationResponseLike | null | undefined): NotificationTap | null {
  if (!isRecord(response) || response.actionIdentifier !== defaultTapAction) return null;
  const notification = isRecord(response.notification) ? response.notification : {};
  const request = isRecord(notification.request) ? notification.request : {};
  const content = isRecord(request.content) ? request.content : {};
  const data = isRecord(content.data) ? content.data : {};
  const base: TapBase = {
    key: `${textOf(request.identifier)}@${typeof notification.date === "number" && Number.isFinite(notification.date) ? notification.date : ""}`,
    title: textOf(content.title),
    body: textOf(content.body)
  };
  // A reminder fires on its own day, so the day it was delivered stands in
  // for one scheduled before the data said which day it was for.
  const day = isDay(data.day) ? data.day : deliveredDay(notification.date);
  switch (data.route) {
    case notificationRoutes.trainingDay: {
      const rides = remindedRides(data.rides);
      const named = Array.isArray(data.horseIds) ? data.horseIds.filter((id): id is string => typeof id === "string" && id !== "") : [];
      return {
        ...base,
        route: "training-day",
        ...(day ? { day } : {}),
        horseIds: named.length ? named : rides.flatMap((ride) => (ride.horseId ? [ride.horseId] : [])),
        rides
      };
    }
    case notificationRoutes.plannedActivity:
      return typeof data.id === "string" && data.id
        ? { ...base, route: "planned-activity", id: data.id, ...(day ? { day } : {}) }
        : { ...base, route: "unknown" };
    case notificationRoutes.ridePhase:
      return { ...base, route: "ride-phase" };
    case notificationRoutes.shopConversation:
      return typeof data.conversationId === "string" && data.conversationId
        ? { ...base, route: "shop-conversation", conversationId: data.conversationId }
        : { ...base, route: "unknown" };
    default:
      return { ...base, route: "unknown" };
  }
}

/** The data of a training-day reminder: its day, and the rides it names. */
export const trainingDayData = (day: string, planned: readonly Pick<TrainingPlanDay, "horseId" | "trainingType">[]) => ({
  route: notificationRoutes.trainingDay,
  day,
  horseIds: planned.flatMap((entry) => (entry.horseId ? [entry.horseId] : [])),
  rides: planned.map((entry): RemindedRide =>
    entry.horseId ? { horseId: entry.horseId, trainingType: entry.trainingType } : { trainingType: entry.trainingType }
  )
});

/** The data of a scheduled activity's reminder: which one, and its day. */
export const plannedActivityData = (activity: { id: string; day: string }) => ({
  route: notificationRoutes.plannedActivity,
  id: activity.id,
  day: activity.day
});

/**
 * Only the reminders show while the app is open: a phase alert stays silent
 * there because the ride's own chime plays instead (ride-cues.ts), a Shop
 * message would land over the conversation it is about, and during a ride
 * nothing comes over the ride screen.
 */
export const showsWhileOpen = (data: unknown, rideRunning: boolean) => {
  const route = isRecord(data) ? data.route : undefined;
  return !rideRunning && (route === notificationRoutes.trainingDay || route === notificationRoutes.plannedActivity);
};

/** What a tap waits for before it can be placed: the training plan, the scheduled activities, or nothing. */
export const tapNeeds = (tap: NotificationTap): "plan" | "planned" | null =>
  tap.route === "training-day" ? "plan" : tap.route === "planned-activity" ? "planned" : null;

/**
 * Answers true the first time it sees a key and false after: a tap can
 * arrive from the listener and again from the last response, and the app can
 * remount in between. Remembers the last `limit` keys.
 */
export function createTapLedger(limit = 50) {
  const order: string[] = [];
  const seen = new Set<string>();
  return (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    order.push(key);
    if (order.length > limit) seen.delete(order.shift() as string);
    return true;
  };
}

const noticeOf = (tap: NotificationTap, fallbackTitle: string, extra: Omit<TapNotice, "title" | "body"> = {}): TapNotice => ({
  title: tap.title || fallbackTitle,
  body: tap.body,
  ...(extra.detail ? { detail: extra.detail } : {}),
  ...(extra.day ? { day: extra.day } : {})
});

/** The calendar on a day, or Home when the calendar is not there to open. */
const calendarOr = (ctx: TapContext, day: string, notice: TapNotice, focusId?: string): TapTarget =>
  ctx.calendar
    ? { screen: "calendar", day, ...(focusId ? { focusId } : {}), notice }
    : { screen: "home", notice: { title: notice.title, body: notice.body, ...(notice.detail ? { detail: notice.detail } : {}) } };

// The reminder's horses first, in its order: the rider tapped a notification
// naming them. Then whatever is still due.
const firstDue = (due: readonly Pick<TrainingPlanDay, "horseId" | "trainingType">[], horseIds: readonly string[]) => {
  for (const horseId of horseIds) {
    const entry = due.find((candidate) => candidate.horseId === horseId);
    if (entry) return entry;
  }
  return due[0];
};

function trainingDayTarget(tap: Extract<NotificationTap, { route: "training-day" }>, ctx: TapContext): TapTarget {
  const day = tap.day ?? ctx.today;
  const notice = (detail?: string) => noticeOf(tap, "Training day", { day, ...(detail ? { detail } : {}) });
  if (day === ctx.today) {
    const plan = ctx.planOn?.(day) ?? null;
    // Without the plan (offline, or the 8 seconds are up), the rides the
    // reminder named this morning are the best word on what is due.
    const ride = firstDue(plan ? plan.due : tap.rides, tap.horseIds);
    if (ride) {
      return {
        screen: "rideSetup",
        ...(ride.horseId ? { horseId: ride.horseId } : {}),
        trainingType: ride.trainingType,
        notice: notice()
      };
    }
    return calendarOr(ctx, day, notice(
      plan ? (plan.planned.length > 0 ? "Already ridden today." : "No longer on your plan today.") : undefined
    ));
  }
  return calendarOr(ctx, day, notice(`This reminder ${day < ctx.today ? "was" : "is"} for ${dayHeading(day)}.`));
}

function plannedActivityTarget(tap: Extract<NotificationTap, { route: "planned-activity" }>, ctx: TapContext): TapTarget {
  const item = ctx.planned?.items.find((candidate) => candidate.id === tap.id);
  if (item) {
    const detail = item.status === "done"
      ? "Already in your journal."
      : item.status === "skipped"
        ? "Marked as didn't happen."
        : `Planned for ${formatActivityTime(item.startMinutes)}.`;
    // A done one shows as the journal entry it became, not as its own row.
    return calendarOr(ctx, item.day, noticeOf(tap, "Scheduled activity", { detail, day: item.day }), item.status === "done" ? undefined : item.id);
  }
  const day = tap.day ?? ctx.today;
  // Only a list read whole can say it is gone; a failed read says nothing.
  return calendarOr(ctx, day, noticeOf(tap, "Scheduled activity", {
    day,
    ...(ctx.planned?.complete && (!ctx.planned.since || day >= ctx.planned.since)
      ? { detail: "This scheduled activity was removed." }
      : {})
  }));
}

/**
 * Where a tap leads. A ride running stays in front of everything but a Shop
 * message, which waits in the Shop for when the ride is over (App.tsx keeps
 * the ride on screen for that one too).
 */
export function tapTarget(tap: NotificationTap, ctx: TapContext): TapTarget {
  if (tap.route === "shop-conversation") return { screen: "shopConversation", conversationId: tap.conversationId };
  if (ctx.rideActive) return { screen: "ride" };
  switch (tap.route) {
    case "training-day":
      return trainingDayTarget(tap, ctx);
    case "planned-activity":
      return plannedActivityTarget(tap, ctx);
    case "ride-phase":
      // The ride it was for has ended: nothing to open, and its recap, if
      // it is up, stays.
      return { screen: "stay" };
    default:
      return tap.title || tap.body ? { screen: "home", notice: noticeOf(tap, "Equina") } : { screen: "stay" };
  }
}
