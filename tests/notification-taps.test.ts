import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PlannedActivity, RideEnd, TrainingPlan, TrainingPlanDay } from "../src/backend/contracts";
import { upcomingPlannedDays } from "../src/domain/training-streak";
import { plannedReminders } from "../src/features/calendar/planned-schedule";
import {
  createTapLedger,
  defaultTapAction,
  notificationRoutes,
  plannedActivityData,
  readNotificationTap,
  showsWhileOpen,
  tapNeeds,
  tapTarget,
  trainingDayData,
  type NotificationResponseLike,
  type NotificationTap,
  type TapContext
} from "../src/features/notifications/notification-routes";

// Notification taps (2026-11-28): the owner tapped the 08:00 "Training day"
// reminder and landed on Home with no idea what it had been about. Only Shop
// messages were routed, and a tap that launched the app from closed was lost
// for every kind. Now each tap opens what it named, and says what it was.

const machineZone = process.env.TZ;
process.env.TZ = "Europe/Bucharest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

// Saturday 28 November 2026, 08:00 in Bucharest (UTC+2), in milliseconds as
// Android reports it.
const eightAm = Date.parse("2026-11-28T06:00:00Z");
const today = "2026-11-28";

const responseFor = (
  data: unknown,
  patch: { title?: string | null; body?: string | null; identifier?: string; date?: number; action?: string } = {}
): NotificationResponseLike => ({
  actionIdentifier: patch.action ?? defaultTapAction,
  notification: {
    ...("date" in patch ? (patch.date === undefined ? {} : { date: patch.date }) : { date: eightAm }),
    request: {
      identifier: patch.identifier ?? "reminder-1",
      content: {
        title: patch.title === undefined ? "Training day" : patch.title,
        body: patch.body === undefined ? "Jumping with Daimon and Dressage with Luna are on your plan today." : patch.body,
        data: data as Record<string, unknown>
      }
    }
  }
});

const tapOf = (data: unknown, patch?: Parameters<typeof responseFor>[1]) => {
  const tap = readNotificationTap(responseFor(data, patch));
  assert.ok(tap, "A plain tap is read.");
  return tap;
};

const saturday: TrainingPlanDay[] = [
  { weekday: 6, trainingType: "jumping", horseId: "daimon" },
  { weekday: 6, trainingType: "dressage", horseId: "luna" }
];

// Payloads -----------------------------------------------------------------

{
  assert.deepEqual(trainingDayData(today, [...saturday, { weekday: 6, trainingType: "hack" }]), {
    route: "training-day",
    day: today,
    horseIds: ["daimon", "luna"],
    rides: [
      { horseId: "daimon", trainingType: "jumping" },
      { horseId: "luna", trainingType: "dressage" },
      { trainingType: "hack" }
    ]
  }, "The day, the horses it names, and each ride, for a tap read before the plan loads.");
  assert.deepEqual(plannedActivityData({ id: "p1", day: "2026-11-29" }), { route: "planned-activity", id: "p1", day: "2026-11-29" });
  // The cancel filters match on the route alone, so they keep finding these.
  assert.equal(trainingDayData(today, saturday).route, notificationRoutes.trainingDay);
  assert.equal(plannedActivityData({ id: "p1", day: today }).route, notificationRoutes.plannedActivity);

  // A scheduled activity's reminder now knows its day.
  const now = new Date(2026, 10, 28, 10, 0).getTime();
  const activity: PlannedActivity = {
    id: "p1", day: "2026-11-29", startMinutes: 9 * 60, trainingType: "dressage",
    phases: [{ title: "Flatwork", plannedSeconds: 1800 }], status: "planned"
  };
  const [reminder] = plannedReminders([activity], () => ({ title: "Dressage with Luna", body: "Body" }), now);
  assert.equal(reminder?.day, "2026-11-29");
  assert.deepEqual(plannedActivityData(reminder!), { route: "planned-activity", id: "p1", day: "2026-11-29" });
}

// Reading a tap -------------------------------------------------------------

{
  // Each route, as the app writes it now.
  const training = tapOf(trainingDayData(today, saturday));
  assert.deepEqual(training, {
    key: `reminder-1@${eightAm}`,
    title: "Training day",
    body: "Jumping with Daimon and Dressage with Luna are on your plan today.",
    route: "training-day",
    day: today,
    horseIds: ["daimon", "luna"],
    rides: [{ horseId: "daimon", trainingType: "jumping" }, { horseId: "luna", trainingType: "dressage" }]
  });
  const planned = tapOf(plannedActivityData({ id: "p1", day: "2026-11-29" }), { title: "Dressage with Luna", body: "It's time." });
  assert.deepEqual(planned, { key: `reminder-1@${eightAm}`, title: "Dressage with Luna", body: "It's time.", route: "planned-activity", id: "p1", day: "2026-11-29" });
  assert.equal(tapOf({ route: "ride-phase" }).route, "ride-phase");
  assert.deepEqual(tapOf({ route: "shop-conversation", conversationId: "c1" }, { title: "New Equina message", body: "" }), {
    key: `reminder-1@${eightAm}`, title: "New Equina message", body: "", route: "shop-conversation", conversationId: "c1"
  });

  // Reminders scheduled before this build: still pending on phones until the
  // app next opens and rebuilds them.
  const oldTraining = tapOf({ route: "training-day", day: today });
  assert.equal(oldTraining.route, "training-day");
  assert.ok(oldTraining.route === "training-day" && oldTraining.day === today);
  assert.ok(oldTraining.route === "training-day" && oldTraining.horseIds.length === 0 && oldTraining.rides.length === 0);
  // An old scheduled-activity reminder has no day: it fired on its own day,
  // which the delivery time gives. iOS reports it in seconds.
  const oldPlanned = tapOf({ route: "planned-activity", id: "p1" }, { date: Date.parse("2026-11-29T07:00:00Z") / 1000 });
  assert.ok(oldPlanned.route === "planned-activity" && oldPlanned.day === "2026-11-29", "Seconds read as seconds.");
  // 22:30 UTC on the 28th is 00:30 on the 29th in Bucharest: the rider's day, not UTC's.
  const pastMidnight = tapOf({ route: "planned-activity", id: "p1" }, { date: Date.parse("2026-11-28T22:30:00Z") });
  assert.ok(pastMidnight.route === "planned-activity" && pastMidnight.day === "2026-11-29", "The rider's local day.");
  const noDate = tapOf({ route: "planned-activity", id: "p1" }, { date: undefined });
  assert.ok(noDate.route === "planned-activity" && noDate.day === undefined, "No day to give: the target falls back to today.");
  assert.equal(noDate.key, "reminder-1@");

  // Only a plain tap opens anything.
  assert.equal(readNotificationTap(responseFor(trainingDayData(today, saturday), { action: "snooze" })), null);
  assert.equal(readNotificationTap(responseFor(trainingDayData(today, saturday), { action: "com.apple.UNNotificationDismissActionIdentifier" })), null);
  assert.equal(readNotificationTap(null), null);
  assert.equal(readNotificationTap(undefined), null);

  // A route the app does not know keeps the notification's words.
  const unknown = tapOf({ route: "order_change", id: "o1" }, { title: "  Order update ", body: "Your saddle shipped." });
  assert.deepEqual(unknown, { key: `reminder-1@${eightAm}`, title: "Order update", body: "Your saddle shipped.", route: "unknown" });

  // Malformed data never throws.
  const shapes: unknown[] = [
    {},
    { actionIdentifier: defaultTapAction },
    { actionIdentifier: defaultTapAction, notification: "x" },
    { actionIdentifier: defaultTapAction, notification: { request: { content: "x" } } },
    { actionIdentifier: defaultTapAction, notification: { request: { content: { data: "route" } } } },
    { actionIdentifier: defaultTapAction, notification: { request: { content: { data: [1, 2] } } } },
    { actionIdentifier: defaultTapAction, notification: { date: Number.NaN, request: { identifier: 7, content: { title: 3, body: {}, data: null } } } }
  ];
  for (const shape of shapes) {
    const tap = readNotificationTap(shape as NotificationResponseLike);
    assert.ok(tap === null || tap.route === "unknown", `${JSON.stringify(shape)} reads as unknown.`);
  }
  const bare = readNotificationTap(shapes[6] as NotificationResponseLike);
  assert.deepEqual(bare, { key: "@", title: "", body: "", route: "unknown" });
  assert.equal(tapOf({ route: "planned-activity" }).route, "unknown", "No id: nothing to find.");
  assert.equal(tapOf({ route: "planned-activity", id: "" }).route, "unknown");
  assert.equal(tapOf({ route: "shop-conversation", conversationId: 4 }).route, "unknown");
  const messy = tapOf({
    route: "training-day",
    day: "28/11/2026",
    horseIds: [1, "", "daimon", null],
    rides: [null, { trainingType: 5 }, { trainingType: "hack", horseId: 3 }, { trainingType: "jumping", horseId: "daimon" }, "x"]
  });
  assert.deepEqual(messy, {
    key: `reminder-1@${eightAm}`,
    title: "Training day",
    body: "Jumping with Daimon and Dressage with Luna are on your plan today.",
    route: "training-day",
    day: today,
    horseIds: ["daimon"],
    rides: [{ trainingType: "hack" }, { horseId: "daimon", trainingType: "jumping" }]
  }, "A day that is not one falls back to the delivery day; bad entries are dropped.");
  const nullWords = tapOf({ route: "ride-phase" }, { title: null, body: null });
  assert.equal(nullWords.title, "");
  assert.equal(nullWords.body, "");
}

// The ledger ---------------------------------------------------------------

{
  const first = createTapLedger();
  const a = tapOf(trainingDayData(today, saturday));
  const again = tapOf(trainingDayData(today, saturday));
  const later = tapOf(trainingDayData(today, saturday), { date: eightAm + 60_000 });
  const other = tapOf(trainingDayData(today, saturday), { identifier: "reminder-2" });
  assert.equal(a.key, again.key, "The listener and the last response give the same key.");
  assert.notEqual(a.key, later.key);
  assert.notEqual(a.key, other.key);
  assert.equal(first(a.key), true);
  assert.equal(first(again.key), false, "Handled once.");
  assert.equal(first(other.key), true);
  assert.equal(first(other.key), false);
  const small = createTapLedger(2);
  assert.equal(small("a"), true);
  assert.equal(small("b"), true);
  assert.equal(small("c"), true);
  assert.equal(small("b"), false);
  assert.equal(small("a"), true, "Only the newest keys are kept.");
}

// Where a training-day reminder leads -----------------------------------------

const plan: TrainingPlan = { id: "v1", effectiveFrom: "2026-11-01", days: saturday, reminders: true };
// The same reading as useTrainingPlan's rideDay: the reminders' rule for one day.
const planOn = (versions: TrainingPlan[], rides: RideEnd[]) => (day: string) => {
  const horses = new Set(["daimon", "luna"]);
  const plannedWith = (with_: RideEnd[]) => upcomingPlannedDays(versions, with_, day, 1, [], horses)[0]?.planned ?? [];
  return { planned: plannedWith([]), due: plannedWith(rides) };
};
const ctx = (patch: Partial<TapContext> = {}): TapContext => ({
  today,
  rideActive: false,
  calendar: true,
  planOn: planOn([plan], []),
  planned: { items: [], complete: true },
  ...patch
});
const ridden = (horseId: string): RideEnd => ({ completedAt: "2026-11-28T07:10:00Z", horseId });
const trainingTap = tapOf(trainingDayData(today, saturday));
const notice = {
  title: "Training day",
  body: "Jumping with Daimon and Dressage with Luna are on your plan today.",
  day: today
};

{
  // Due today: the setup sheet, on the first horse it named.
  assert.deepEqual(tapTarget(trainingTap, ctx()), { screen: "rideSetup", horseId: "daimon", trainingType: "jumping", notice });
  // Daimon already ridden: Luna is what is left.
  assert.deepEqual(
    tapTarget(trainingTap, ctx({ planOn: planOn([plan], [ridden("daimon")]) })),
    { screen: "rideSetup", horseId: "luna", trainingType: "dressage", notice }
  );
  // The reminder's own order wins over the plan's.
  const lunaFirst = tapOf(trainingDayData(today, [saturday[1]!, saturday[0]!]));
  const target = tapTarget(lunaFirst, ctx());
  assert.ok(target.screen === "rideSetup" && target.horseId === "luna");
  // An old reminder with no horses: the first ride still due.
  const old = tapOf({ route: "training-day", day: today });
  const oldTarget = tapTarget(old, ctx());
  assert.ok(oldTarget.screen === "rideSetup" && oldTarget.horseId === "daimon" && oldTarget.trainingType === "jumping");
  // A rider with no horse: a ride with no horse.
  const loose: TrainingPlan = { ...plan, days: [{ weekday: 6, trainingType: "hack" }] };
  const looseTap = tapOf(trainingDayData(today, loose.days));
  assert.deepEqual(
    tapTarget(looseTap, ctx({
      planOn: (day) => ({
        planned: upcomingPlannedDays([loose], [], day, 1)[0]?.planned ?? [],
        due: upcomingPlannedDays([loose], [], day, 1)[0]?.planned ?? []
      })
    })),
    { screen: "rideSetup", trainingType: "hack", notice }
  );

  // All ridden: the calendar on the day, saying so.
  assert.deepEqual(
    tapTarget(trainingTap, ctx({ planOn: planOn([plan], [ridden("daimon"), ridden("luna")]) })),
    { screen: "calendar", day: today, notice: { ...notice, detail: "Already ridden today." } }
  );
  // The plan changed since: nothing on Saturdays any more.
  const changed: TrainingPlan = { id: "v2", effectiveFrom: "2026-11-28", days: [{ weekday: 1, trainingType: "jumping", horseId: "daimon" }], reminders: true };
  assert.deepEqual(
    tapTarget(trainingTap, ctx({ planOn: planOn([plan, changed], []) })),
    { screen: "calendar", day: today, notice: { ...notice, detail: "No longer on your plan today." } }
  );

  // Tapped a week later, from the lock screen's history: the calendar on that day.
  assert.deepEqual(
    tapTarget(trainingTap, ctx({ today: "2026-12-05" })),
    { screen: "calendar", day: today, notice: { ...notice, detail: "This reminder was for Saturday 28 November." } }
  );

  // A ride running stays in front.
  assert.deepEqual(tapTarget(trainingTap, ctx({ rideActive: true })), { screen: "ride" });

  // The plan not in (offline, 8 seconds up): the rides the reminder named.
  assert.deepEqual(tapTarget(trainingTap, ctx({ planOn: null })), { screen: "rideSetup", horseId: "daimon", trainingType: "jumping", notice });
  // ...and an old reminder that named none: the calendar with its words only.
  assert.deepEqual(tapTarget(old, ctx({ planOn: null })), { screen: "calendar", day: today, notice });

  // No calendar for the account (ride logging off): Home, with the words.
  assert.deepEqual(
    tapTarget(trainingTap, ctx({ calendar: false, planOn: planOn([plan], [ridden("daimon"), ridden("luna")]) })),
    { screen: "home", notice: { title: notice.title, body: notice.body, detail: "Already ridden today." } }
  );

  // A reminder with no title still says what it was.
  const untitled = tapOf({ route: "training-day", day: today }, { title: "", body: "" });
  assert.deepEqual(tapTarget(untitled, ctx({ planOn: planOn([plan], [ridden("daimon"), ridden("luna")]) })), {
    screen: "calendar", day: today, notice: { title: "Training day", body: "", detail: "Already ridden today.", day: today }
  });
}

// Where a scheduled activity's reminder leads -----------------------------------

{
  const item = (patch: Partial<PlannedActivity> = {}): PlannedActivity => ({
    id: "p1", day: today, startMinutes: 9 * 60 + 15, trainingType: "dressage",
    phases: [{ title: "Flatwork", plannedSeconds: 1800 }], status: "planned", ...patch
  });
  const words = { title: "Dressage with Luna", body: "It's time for the training you scheduled. Mark it done in the calendar after." };
  const tap = tapOf(plannedActivityData({ id: "p1", day: today }), words);
  const withItems = (items: PlannedActivity[], complete = true) => ctx({ planned: { items, complete } });

  assert.deepEqual(tapTarget(tap, withItems([item()])), {
    screen: "calendar", day: today, focusId: "p1", notice: { ...words, detail: "Planned for 09:15.", day: today }
  }, "Still planned: its day, with it marked out.");
  assert.deepEqual(tapTarget(tap, withItems([item({ status: "done", rideEntryId: "e1" })])), {
    screen: "calendar", day: today, notice: { ...words, detail: "Already in your journal.", day: today }
  }, "Done shows as its journal entry, so nothing to mark out.");
  assert.deepEqual(tapTarget(tap, withItems([item({ status: "skipped" })])), {
    screen: "calendar", day: today, focusId: "p1", notice: { ...words, detail: "Marked as didn't happen.", day: today }
  });
  assert.deepEqual(tapTarget(tap, withItems([item({ day: "2026-11-30" })])), {
    screen: "calendar", day: "2026-11-30", focusId: "p1", notice: { ...words, detail: "Planned for 09:15.", day: "2026-11-30" }
  }, "Moved since: the day it is on now.");
  assert.deepEqual(tapTarget(tap, withItems([item({ id: "other" })])), {
    screen: "calendar", day: today, notice: { ...words, detail: "This scheduled activity was removed.", day: today }
  }, "Gone from a list read whole: removed.");
  const tomorrowTap = tapOf(plannedActivityData({ id: "p1", day: "2026-11-29" }), words);
  assert.deepEqual(tapTarget(tomorrowTap, withItems([])), {
    screen: "calendar", day: "2026-11-29", notice: { ...words, detail: "This scheduled activity was removed.", day: "2026-11-29" }
  }, "Missing, on the day it was for.");
  const dayless = tapOf({ route: "planned-activity", id: "p1" }, { ...words, date: undefined });
  assert.deepEqual(tapTarget(dayless, withItems([])), {
    screen: "calendar", day: today, notice: { ...words, detail: "This scheduled activity was removed.", day: today }
  }, "Missing with no day at all: today.");
  // A reminder older than the list's window: its absence proves nothing.
  const oldTap = tapOf(plannedActivityData({ id: "p1", day: "2026-10-01" }), words);
  assert.deepEqual(tapTarget(oldTap, ctx({ planned: { items: [], complete: true, since: "2026-10-30" } })), {
    screen: "calendar", day: "2026-10-01", notice: { ...words, day: "2026-10-01" }
  }, "Older than the loaded window: its words only, never 'removed'.");
  const inside = tapTarget(tomorrowTap, ctx({ planned: { items: [], complete: true, since: "2026-10-30" } }));
  assert.equal(inside.screen === "calendar" ? inside.notice?.detail : undefined,
    "This scheduled activity was removed.", "Inside the window, missing still means removed.");
  assert.deepEqual(tapTarget(tap, withItems([], false)), {
    screen: "calendar", day: today, notice: { ...words, day: today }
  }, "A failed read cannot say it was removed.");
  assert.deepEqual(tapTarget(tap, ctx({ planned: null })), {
    screen: "calendar", day: today, notice: { ...words, day: today }
  }, "Not read yet: its words only.");
  assert.deepEqual(tapTarget(tap, ctx({ rideActive: true, planned: { items: [item()], complete: true } })), { screen: "ride" });
  assert.deepEqual(tapTarget(tap, ctx({ calendar: false, planned: { items: [item()], complete: true } })), {
    screen: "home", notice: { ...words, detail: "Planned for 09:15." }
  });
}

// Shop, ride phases and the rest -------------------------------------------------

{
  const shop = tapOf({ route: "shop-conversation", conversationId: "c1" });
  assert.deepEqual(tapTarget(shop, ctx()), { screen: "shopConversation", conversationId: "c1" });
  assert.deepEqual(tapTarget(shop, ctx({ rideActive: true })), { screen: "shopConversation", conversationId: "c1" },
    "Mid-ride it still waits in the Shop; App.tsx keeps the ride on screen.");
  const phase = tapOf({ route: "ride-phase" }, { title: "Canter · 10 min", body: "Phase 3 of 5" });
  assert.deepEqual(tapTarget(phase, ctx({ rideActive: true })), { screen: "ride" });
  assert.deepEqual(tapTarget(phase, ctx()), { screen: "stay" }, "Its ride is over: the app stays as it was, its recap included.");
  const unknown = tapOf({ route: "order_change" }, { title: "Order update", body: "Your saddle shipped." });
  assert.deepEqual(tapTarget(unknown, ctx()), { screen: "home", notice: { title: "Order update", body: "Your saddle shipped." } });
  assert.deepEqual(tapTarget(tapOf({}, { title: "", body: "" }), ctx()), { screen: "stay" }, "No words to show: nothing to open.");
  assert.deepEqual(tapTarget(unknown, ctx({ rideActive: true })), { screen: "ride" });
}

// What waits for what, and what shows while the app is open ----------------------

{
  assert.equal(tapNeeds(trainingTap), "plan");
  assert.equal(tapNeeds(tapOf(plannedActivityData({ id: "p1", day: today }))), "planned");
  assert.equal(tapNeeds(tapOf({ route: "ride-phase" })), null);
  assert.equal(tapNeeds(tapOf({ route: "shop-conversation", conversationId: "c1" })), null);
  assert.equal(tapNeeds(tapOf({})), null);

  assert.equal(showsWhileOpen(trainingDayData(today, saturday), false), true);
  assert.equal(showsWhileOpen(plannedActivityData({ id: "p1", day: today }), false), true);
  assert.equal(showsWhileOpen({ route: "ride-phase" }, false), false, "The chime plays instead (ride-cues.ts).");
  assert.equal(showsWhileOpen({ route: "shop-conversation", conversationId: "c1" }, false), false);
  assert.equal(showsWhileOpen(undefined, false), false);
  assert.equal(showsWhileOpen("training-day", false), false);
  for (const data of [trainingDayData(today, saturday), plannedActivityData({ id: "p1", day: today }), { route: "ride-phase" }]) {
    assert.equal(showsWhileOpen(data, true), false, "Nothing over a ride.");
  }
}

// Wiring ---------------------------------------------------------------------------

{
  const hook = read("src/features/notifications/useNotificationTaps.ts");
  const ledger = hook.indexOf("const firstTimeSeen = createTapLedger();");
  assert.ok(ledger > 0 && ledger < hook.indexOf("export function useNotificationTaps"), "The ledger lives outside React, so a remount does not open a tap twice.");
  assert.match(hook, /if \(Platform\.OS === "web"\) return;/);
  const listen = hook.indexOf("Notifications.addNotificationResponseReceivedListener(deliver)");
  const last = hook.indexOf("deliver(Notifications.getLastNotificationResponse())");
  assert.ok(listen > 0 && last > listen, "Listening first, then the tap that launched the app.");
  assert.match(hook, /if \(!tap \|\| !firstTimeSeen\(tap\.key\)\) return;\s+try \{[^}]*Notifications\.clearLastNotificationResponse\(\);/, "Seen once, then cleared, before it is handed on.");
  assert.match(hook, /onTapRef\.current\(tap\);/);
  assert.match(hook, /\}, \[\]\);/, "Registered once.");
  assert.match(hook, /showsWhileOpen\(notification\.request\.content\.data, rideRunningRef\.current\)/);

  // One listener for the whole app.
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
  const listeners = sourceFiles(join(root, "src")).filter((path) =>
    readFileSync(path, "utf8").includes("addNotificationResponseReceivedListener(")
  );
  assert.deepEqual(listeners, [join(root, "src/features/notifications/useNotificationTaps.ts")]);
  const handlers = sourceFiles(join(root, "src")).filter((path) => readFileSync(path, "utf8").includes("setNotificationHandler("));
  assert.deepEqual(handlers, [join(root, "src/features/notifications/useNotificationTaps.ts")]);
  const push = read("src/features/notifications/usePushRegistration.ts");
  assert.doesNotMatch(push, /onOpenConversation|addNotificationResponseReceivedListener/);

  // App.tsx listens from its first render and places a tap once it can.
  const app = read("src/App.tsx");
  const hookCall = app.indexOf("useNotificationTaps({");
  assert.ok(hookCall > 0 && hookCall < app.indexOf('if (equinaSession.phase === "restoring")'), "Above the early returns, where hooks run on every render.");
  assert.doesNotMatch(app, /onOpenConversation/);
  assert.match(app, /const tapGateOpen =\s+equinaSession\.phase === "authenticated" &&\s+accountCreated &&\s+!betaDoor &&\s+!equinaSession\.recoveryRequired &&\s+activeRideChecked &&/);
  assert.match(app, /\? \(trainingPlan\.loaded \|\| trainingPlan\.failed\) && horseRecords\.horsesLoaded\s+: tapNeed === "planned"\s+\? plannedActivities\.loaded/);
  assert.match(app, /setTimeout\(\(\) => setTapWaitOver\(true\), 8000\)/, "Offline, the tap is placed after 8 seconds.");
  assert.match(app, /if \(equinaSession\.phase === "demo"\) \{\s+setPendingTap\(null\);\s+return;\s+\}/);
  assert.match(app, /const tap = pendingTap;\s+\/\/ Taken first, so nothing below can place it twice\.\s+setPendingTap\(null\);\s+openTapTarget\(/);
  assert.match(app, /planOn: ridePersistence && trainingPlan\.loaded && horseRecords\.horsesListed \? trainingPlan\.rideDay : null/);
  assert.match(app, /setActiveRideChecked\(true\);/);
  // Shop keeps what it did: the conversation waits there during a ride.
  assert.match(app, /setPendingShopConversationId\(target\.conversationId\);\s+setShopMode\("browse"\);\s+setShopBuyerView\("conversation"\);[\s\S]{0,400}if \(rideActiveRef\.current\) return;\s+closeOverlaysForTap\(\);\s+setTab\("gear"\);/);
  // The sheet opens on the reminder's ride and says what it was.
  assert.match(app, /horseId=\{rideSetupSheetDraft\.horseId\}\s+trainingType=\{rideSetupSheetDraft\.trainingType\}\s+phases=\{rideSetupSheetDraft\.phases\}/);
  assert.match(app, /notice=\{tapNotice\?\.on === "rideSetup" \? tapNotice\.notice : null\}/);
  assert.match(app, /openedFor=\{rideSetupOverride\?\.key\}/);
  assert.match(app, /const confirmRideSetup = \(plan: RidePlan\) => \{\s+setRideSetupOpen\(false\);\s+closeRideSetupExtras\(\);/);
  // The calendar shows it on its day, and closing ends it.
  assert.match(app, /notice=\{tapNotice\?\.on === "calendar" \? tapNotice\.notice : null\}\s+focusId=\{calendarFocusId\}/);
  assert.match(app, /onClose=\{closeCalendar\}/);
  assert.match(app, /tapNotice\?\.on === "home" && tab === "home" && !ralfOpen \? \(\s+<NotificationNoticeCard/);

  // The reminders write the payloads read back here; the cancel filters still match.
  const training = read("src/features/ride/training-reminders.ts");
  assert.match(training, /data: trainingDayData\(reminder\.day, reminder\.planned\)/);
  assert.match(training, /const reminderRoute = notificationRoutes\.trainingDay;/);
  assert.match(training, /\.filter\(\(request\) => request\.content\.data\?\.route === reminderRoute\)/);
  const plannedSource = read("src/features/calendar/planned-reminders.ts");
  assert.match(plannedSource, /data: plannedActivityData\(reminder\)/);
  assert.match(plannedSource, /const route = notificationRoutes\.plannedActivity;/);
  assert.match(plannedSource, /\.filter\(\(request\) => request\.content\.data\?\.route === route\)/);
  const cues = read("src/features/ride/ride-cues.ts");
  assert.match(cues, /const alertRoute = notificationRoutes\.ridePhase;/);
  assert.match(cues, /data: \{ route: alertRoute \}/);
  assert.match(cues, /scheduled\.filter\(\(request\) => request\.content\.data\?\.route === alertRoute\)/);

  // A tapped reminder is read by the reminders' own rule.
  const trainingPlan = read("src/features/ride/useTrainingPlan.ts");
  assert.match(trainingPlan, /upcomingPlannedDays\(versions, rides, day, 1, timeOff, horses\)\[0\]\?\.planned \?\? \[\]/);
  assert.match(trainingPlan, /return \{ planned: plannedWith\(\[\]\), due: plannedWith\(completions\) \};/);

  // The notice, where the tap lands.
  const calendar = read("src/features/calendar/ActivityCalendarScreen.tsx");
  assert.match(calendar, /\{notice && onDismissNotice && \(!notice\.day \|\| notice\.day === selected\) \? \(\s+<NotificationNoticeCard/, "Only on the day it is about.");
  assert.match(calendar, /item\.id === focusId && styles\.plannedRowFocused/);
  assert.match(calendar, /\}, \[visible, initialDay, notice\]\);/, "A new tap brings the calendar back to its day.");
  const sheet = read("src/features/ride/RideSetupSheet.tsx");
  assert.match(sheet, /\{notice && onDismissNotice && !logging \? \(\s+<NotificationNoticeCard/);
  assert.match(sheet, /\}, \[visible, openedFor\]\);/, "A new tap sets the open sheet up again.");
}

if (machineZone === undefined) delete process.env.TZ;
else process.env.TZ = machineZone;

console.log("Notification taps passed.");

{
  // A tap waits while a new horse is still saving: iOS will not present a
  // sheet over the open horse creator, so the tap is placed once it settles.
  const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(app, /activeRideChecked &&[\s\S]{0,200}horseRecords\.saving !== "horse:create";/);
  assert.match(app, /setHorseSwitcherOpen\(false\);\s+setHorseCreatorOpen\(false\);/);
  assert.match(app, /since: firstLoggableDay\(localToday\(\)\)/);
}
