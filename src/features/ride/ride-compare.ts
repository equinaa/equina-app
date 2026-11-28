import type { PlannedActivity, RideEnd, RideEntry, RideMoodRecord } from "../../backend/contracts";
import { activityDayOf, weekOf } from "../../domain/activity-calendar";
import { disciplineLabel } from "../../domain/labels";
import { localDayOf, localMomentLabel, localToday, shortDayLabel } from "../../domain/local-day";
import {
  addDays,
  belongsTo,
  isoWeekday,
  ofHorse,
  planForHorse,
  planOn,
  plannedOn,
  rideDays,
  ridesForHorse,
  timeOffOn,
  trainingStreakFor,
  type PlanVersion,
  type TimeOffPeriod,
  type WeekDay,
  type WeekDayState
} from "../../domain/training-streak";
import { ridePhaseLimits, rideTrainingLabel, rideTrainingTypeById, type RidePhasePlan, type RideTrainingType } from "./ride-plan";

/**
 * One ride shown among its siblings: the same training on the same horse,
 * before and after it. Everything here is pure and derived from the journal
 * on every read, so a ride edited or deleted moves the comparison at once.
 *
 * The honesty rules are the journal's own (ride-stats.ts): minutes typed in
 * with Add activity are logged, not timed, and say so; a logged activity
 * records every phase, so "every phase reached" is counted over timed rides
 * only; nothing is compared against no history, and a feeling nobody saved
 * is never filled in.
 */

/** Which rides count as this one's siblings. */
export type CompareScope = "horse+training" | "training" | "horse";

/** What this ride is measured against: the usual, the longest, or the one before. */
export type CompareBaseline = "average" | "best" | "previous";

export const compareScopes: readonly CompareScope[] = ["horse+training", "training", "horse"];

/** Rides before this one that the comparison reads: enough to be a habit, few enough to be recent. */
export const COMPARE_RIDES = 5;

/** The bars the trend shows at most. */
export const TREND_RIDES = 9;

const startOf = (entry: RideEntry) => Date.parse(entry.startedAt);
const byStart = (left: RideEntry, right: RideEntry) => startOf(left) - startOf(right) || left.id.localeCompare(right.id);

/** The training the rider set up, or the discipline for rides from before the setup sheet. */
export const trainingWordOf = (entry: RideEntry) =>
  rideTrainingLabel(entry.trainingType) ?? disciplineLabel(entry.discipline);

/**
 * The rides this one sits among, oldest first, itself included. Rides from
 * before the setup sheet have no training type and are left out: their
 * phases and minutes were not set up the same way. A ride without a horse
 * reads every horse's, as the streak does for a rider with none.
 */
export const ridePeers = (
  entries: readonly RideEntry[],
  entry: RideEntry,
  scope: CompareScope = "horse+training"
): RideEntry[] => {
  if (!entry.trainingType) return [];
  const matches = (candidate: RideEntry) =>
    candidate.trainingType !== undefined
    && (scope === "horse" || candidate.trainingType === entry.trainingType)
    && (scope === "training" || belongsTo(candidate, entry.horseId));
  return [...entries.filter((candidate) => candidate.id !== entry.id && matches(candidate)), entry].sort(byStart);
};

/** Where the ride is among its peers, and the ones either side of it. */
export const peerPosition = (peers: readonly RideEntry[], entry: RideEntry) => {
  const index = peers.findIndex((peer) => peer.id === entry.id);
  return {
    index,
    count: peers.length,
    previous: index > 0 ? peers[index - 1] : undefined,
    next: index >= 0 && index < peers.length - 1 ? peers[index + 1] : undefined
  };
};

/** Minutes as a person says them. A logged ride's are the ones typed in. */
export const rideMinutes = (entry: Pick<RideEntry, "elapsedSeconds">) => Math.round(Math.max(0, entry.elapsedSeconds) / 60);

export const isLogged = (entry: Pick<RideEntry, "source">) => entry.source === "manual";

/** "Tue 3 Nov", the day half of the journal's own line. */
export const rideDayLabel = (entry: Pick<RideEntry, "startedAt">) => localMomentLabel(entry.startedAt)?.split(" · ")[0] ?? "";

/** "3 Nov": the day a ride started, short. */
export const rideShortDay = (entry: Pick<RideEntry, "startedAt">) => {
  const day = localDayOf(entry.startedAt);
  return day ? shortDayLabel(day) ?? "" : "";
};

/** "Tue 1 Dec" for a local day, YYYY-MM-DD, the way a ride's day reads. */
export const dayLabel = (day: string) => `${weekdayName(day).slice(0, 3)} ${shortDayLabel(day) ?? day}`;

// Words -----------------------------------------------------------------------

export type CompareWords = { training: string; horse?: string };

/** "Jumping with Daimon", "Jumping, any horse", "All rides with Daimon": the scope chip. */
export const scopeLabel = (scope: CompareScope, words: CompareWords) => {
  if (scope === "training") return words.horse ? `${words.training}, any horse` : words.training;
  if (scope === "horse") return words.horse ? `All rides with ${words.horse}` : "All rides";
  return words.horse ? `${words.training} with ${words.horse}` : words.training;
};

/** What "your usual ..." is about: "Jumping with Daimon", "Jumping", "ride with Daimon". */
const usualWhat = (scope: CompareScope, words: CompareWords) => {
  if (scope === "horse") return words.horse ? `ride with ${words.horse}` : "ride";
  if (scope === "training") return words.training;
  return words.horse ? `${words.training} with ${words.horse}` : words.training;
};

/** "Jumping ride with Daimon", or the plural. */
const rideNoun = (scope: CompareScope, words: CompareWords, many: boolean) => {
  const rides = many ? "rides" : "ride";
  const withHorse = scope !== "training" && words.horse ? ` with ${words.horse}` : "";
  return scope === "horse" ? `${rides}${withHorse}` : `${words.training} ${rides}${withHorse}`;
};

/** "your last 5 Jumping rides with Daimon", or "your last Jumping ride with Daimon" for one. */
export const lastRidesPhrase = (scope: CompareScope, words: CompareWords, count: number) =>
  count === 1 ? `your last ${rideNoun(scope, words, false)}` : `your last ${count} ${rideNoun(scope, words, true)}`;

// Comparing ---------------------------------------------------------------------

/** One phase of this ride next to the same phase in the rides before it. */
export type ComparePhase = {
  title: string;
  detail?: string;
  plannedSeconds: number;
  /** This ride's time in it. Absent: a timed ride that never reached it. */
  seconds?: number;
  /** The usual time in it, over the timed rides that had it. Absent: none had it. */
  usualSeconds?: number;
  /** How many timed rides the usual is the average of. */
  matched: number;
};

export type PhaseMove = { title: string; minutes: number };

export type RideComparison = {
  kind: CompareBaseline;
  /** The rides compared against: the last COMPARE_RIDES before this one, oldest first. */
  baseline: RideEntry[];
  minutes: number;
  logged: boolean;
  /** The average of the baseline's minutes. Null with nothing before this ride. */
  averageMinutes: number | null;
  /** What `kind` measures against: the average, the longest, or the ride before. */
  reference: { minutes: number; entry?: RideEntry } | null;
  /** This ride's minutes less the reference's. */
  deltaMinutes: number | null;
  /** Longer than every ride in the baseline. */
  longest: boolean;
  /** "8 min longer than your usual Jumping with Daimon (44 min)". Null with nothing to compare. */
  sentence: string | null;
  /** Rides in the baseline added by hand: their minutes were typed. */
  loggedInBaseline: number;
  phases: {
    reached: number;
    total: number;
    /** Timed rides in the baseline that had phases: only they can miss one. */
    timed: number;
    /** Of those, the ones that reached every phase. */
    everyPhase: number;
  };
  feelings: {
    /** The feelings saved in the baseline, most often first. */
    tally: Array<{ mood: RideMoodRecord; rides: number }>;
    recorded: number;
    rides: number;
  };
  phaseRows: ComparePhase[];
  /** Timed rides in the baseline with phases to compare against. */
  phaseRides: number;
  /** The phases that explain the difference from the usual, largest first (two at most). */
  explains: PhaseMove[];
  /** "The extra 8 min went to Training (+4) and Cool-down (+4)." Null when the phases cannot say. */
  phaseSummary: string | null;
};

/** The rides before this one that it is compared with, oldest first. */
export const baselineOf = (entry: RideEntry, peers: readonly RideEntry[], count = COMPARE_RIDES) =>
  peers.filter((peer) => peer.id !== entry.id && byStart(peer, entry) < 0).slice(-count);

const moodOrder: readonly RideMoodRecord[] = ["fresh", "focused", "tender"];

const tallyMoods = (rides: readonly RideEntry[]) => {
  const counts = new Map<RideMoodRecord, number>();
  for (const ride of rides) if (ride.mood) counts.set(ride.mood, (counts.get(ride.mood) ?? 0) + 1);
  return [...counts.entries()]
    .map(([mood, count]) => ({ mood, rides: count }))
    .sort((left, right) => right.rides - left.rides || moodOrder.indexOf(left.mood) - moodOrder.indexOf(right.mood));
};

const phaseKey = (title: string) => title.trim().toLowerCase();

/**
 * Each phase keyed by its title and which of that title it is: two "Trot"
 * phases in one ride are the first and the second Trot, wherever they sit,
 * so a ride with a phase added or removed still lines up with the others.
 */
const keyedPhases = (entry: RideEntry) => {
  const seen = new Map<string, number>();
  return (entry.phases ?? []).map((phase) => {
    const key = phaseKey(phase.title);
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    return { key: `${key}#${nth}`, phase };
  });
};

const signed = (minutes: number) => (minutes > 0 ? `+${minutes}` : `−${Math.abs(minutes)}`);

const joinAnd = (parts: readonly string[]) =>
  parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

const phaseName = (title: string) => title.trim() || "A phase";

/** The phases that moved the same way as the whole ride, largest first, as many as explain half of it. */
const phaseMoves = (rows: readonly ComparePhase[], difference: number): PhaseMove[] => {
  if (difference === 0) return [];
  const moves = rows
    .filter((row) => row.seconds !== undefined && row.usualSeconds !== undefined)
    .map((row) => ({ title: phaseName(row.title), minutes: Math.round(((row.seconds ?? 0) - (row.usualSeconds ?? 0)) / 60) }))
    .filter((move) => (difference > 0 ? move.minutes > 0 : move.minutes < 0))
    .sort((left, right) => Math.abs(right.minutes) - Math.abs(left.minutes))
    .slice(0, 2);
  const explained = moves.reduce((sum, move) => sum + Math.abs(move.minutes), 0);
  // Two phases a minute longer do not explain a ride ten minutes longer:
  // nothing is said rather than a reason the numbers do not carry.
  return explained * 2 >= Math.abs(difference) ? moves : [];
};

const phaseSummaryOf = (difference: number | null, moves: readonly PhaseMove[], rows: readonly ComparePhase[]) => {
  if (difference === null) return null;
  const list = joinAnd(moves.map((move) => `${move.title} (${signed(move.minutes)})`));
  if (difference > 0 && moves.length) return `The extra ${difference} min went to ${list}.`;
  if (difference < 0 && moves.length) return `The ${Math.abs(difference)} min less came out of ${list}.`;
  const compared = rows.filter((row) => row.seconds !== undefined && row.usualSeconds !== undefined);
  if (difference === 0 && compared.length && compared.every((row) => Math.abs((row.seconds ?? 0) - (row.usualSeconds ?? 0)) < 90)) {
    return "Every phase ran close to usual.";
  }
  return null;
};

const sentenceFor = (
  kind: CompareBaseline,
  scope: CompareScope,
  words: CompareWords,
  minutes: number,
  baseline: readonly RideEntry[],
  reference: { minutes: number; entry?: RideEntry }
) => {
  const difference = minutes - reference.minutes;
  const by = `${Math.abs(difference)} min ${difference > 0 ? "longer" : "shorter"} than`;
  const lastOne = rideNoun(scope, words, false);
  const onDay = reference.entry ? ` on ${rideDayLabel(reference.entry)}` : "";
  // With one ride before, the usual, the longest and the last are that ride.
  if (kind === "previous" || baseline.length === 1) {
    const what = `your last ${lastOne} (${reference.minutes} min${onDay})`;
    return difference === 0 ? `As long as ${what}` : `${by} ${what}`;
  }
  if (kind === "average") {
    const what = `your usual ${usualWhat(scope, words)} (${reference.minutes} min)`;
    return difference === 0 ? `The same as ${what}` : `${by} ${what}`;
  }
  const rides = lastRidesPhrase(scope, words, baseline.length);
  if (difference > 0) return `Longer than any of ${rides} (longest ${reference.minutes} min)`;
  if (difference === 0) return `As long as the longest of ${rides} (${reference.minutes} min)`;
  return `${by} the longest of ${rides} (${reference.minutes} min${onDay})`;
};

/**
 * This ride against the rides before it. With none before it there is
 * nothing to measure: every number that would need history is null, and
 * the screen says it is the first instead of comparing with zero.
 */
export const compareRide = (
  entry: RideEntry,
  peers: readonly RideEntry[],
  kind: CompareBaseline = "average",
  options: { scope?: CompareScope; words?: CompareWords } = {}
): RideComparison => {
  const scope = options.scope ?? "horse+training";
  const words = options.words ?? { training: trainingWordOf(entry) };
  const baseline = baselineOf(entry, peers);
  const minutes = rideMinutes(entry);
  const baselineMinutes = baseline.map(rideMinutes);
  const averageMinutes = baseline.length
    ? Math.round(baselineMinutes.reduce((sum, value) => sum + value, 0) / baseline.length)
    : null;
  const longestRide = baseline.reduce<RideEntry | undefined>(
    // The most recent of equals: "on 27 Oct" names the one the rider remembers.
    (best, ride) => (!best || rideMinutes(ride) >= rideMinutes(best) ? ride : best),
    undefined
  );
  const previousRide = baseline[baseline.length - 1];
  const reference = !baseline.length || averageMinutes === null
    ? null
    : kind === "previous" && previousRide
      ? { minutes: rideMinutes(previousRide), entry: previousRide }
      : kind === "best" && longestRide
        ? { minutes: rideMinutes(longestRide), entry: longestRide }
        // One ride before: the usual is that ride, and it has a day.
        : { minutes: averageMinutes, ...(baseline.length === 1 && previousRide ? { entry: previousRide } : {}) };

  // Phases: only a timed ride can stop before its last one.
  const timedWithPhases = baseline.filter((ride) => !isLogged(ride) && ride.totalPhases > 0);
  const everyPhase = timedWithPhases.filter((ride) => ride.completedPhases >= ride.totalPhases).length;

  // The usual time in each phase comes from what the clock measured, never
  // from minutes typed in afterwards.
  const phaseRides = baseline.filter((ride) => !isLogged(ride) && (ride.phases?.length ?? 0) > 0);
  const usual = new Map<string, number[]>();
  for (const ride of phaseRides) {
    for (const { key, phase } of keyedPhases(ride)) {
      if (phase.actualSeconds === undefined) continue;
      usual.set(key, [...(usual.get(key) ?? []), phase.actualSeconds]);
    }
  }
  const phaseRows: ComparePhase[] = keyedPhases(entry).map(({ key, phase }) => {
    const times = usual.get(key) ?? [];
    return {
      title: phase.title,
      ...(phase.detail ? { detail: phase.detail } : {}),
      plannedSeconds: phase.plannedSeconds,
      ...(phase.actualSeconds !== undefined ? { seconds: phase.actualSeconds } : {}),
      ...(times.length ? { usualSeconds: Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) } : {}),
      matched: times.length
    };
  });
  const usualDifference = averageMinutes === null ? null : minutes - averageMinutes;
  const explains = usualDifference === null ? [] : phaseMoves(phaseRows, usualDifference);

  return {
    kind,
    baseline,
    minutes,
    logged: isLogged(entry),
    averageMinutes,
    reference,
    deltaMinutes: reference ? minutes - reference.minutes : null,
    longest: baseline.length > 0 && baselineMinutes.every((value) => minutes > value),
    sentence: reference ? sentenceFor(kind, scope, words, minutes, baseline, reference) : null,
    loggedInBaseline: baseline.filter(isLogged).length,
    phases: {
      reached: entry.completedPhases,
      total: entry.totalPhases,
      timed: timedWithPhases.length,
      everyPhase
    },
    feelings: {
      tally: tallyMoods(baseline),
      recorded: baseline.filter((ride) => ride.mood).length,
      rides: baseline.length
    },
    phaseRows,
    phaseRides: phaseRides.length,
    explains,
    phaseSummary: phaseRides.length ? phaseSummaryOf(usualDifference, explains, phaseRows) : null
  };
};

/** "every phase in 3 of 5", or "of 4 timed" when some were logged. Null when no timed ride had phases. */
export const everyPhaseLine = (comparison: RideComparison) => {
  const { timed, everyPhase } = comparison.phases;
  if (timed === 0) return null;
  return timed === comparison.baseline.length ? `every phase in ${everyPhase} of ${timed}` : `every phase in ${everyPhase} of ${timed} timed`;
};

/** "focused in 3 of 5", or that none was saved. */
export const feelingLine = (comparison: RideComparison) => {
  const top = comparison.feelings.tally[0];
  if (!top) return comparison.feelings.rides === 1 ? "no feeling saved" : "no feelings saved";
  return `${top.mood} in ${top.rides} of ${comparison.feelings.rides}`;
};

// The trend ---------------------------------------------------------------------

export type TrendPoint = {
  entry: RideEntry;
  minutes: number;
  logged: boolean;
  reached: number;
  total: number;
  mood?: RideMoodRecord;
  current: boolean;
};

/**
 * Up to `count` peers for the trend: the newest ones when they hold this
 * ride, otherwise the ones around it, so the ride on screen is always a bar.
 */
export const rideTrend = (entry: RideEntry, peers: readonly RideEntry[], count = TREND_RIDES) => {
  const size = Math.max(1, Math.floor(count));
  const index = peers.findIndex((peer) => peer.id === entry.id);
  const start = peers.length <= size || index < 0 || index >= peers.length - size
    ? Math.max(0, peers.length - size)
    : Math.max(0, index - Math.floor(size / 2));
  const window = peers.slice(start, start + size);
  return {
    points: window.map((ride): TrendPoint => ({
      entry: ride,
      minutes: rideMinutes(ride),
      logged: isLogged(ride),
      reached: ride.completedPhases,
      total: ride.totalPhases,
      ...(ride.mood ? { mood: ride.mood } : {}),
      current: ride.id === entry.id
    })),
    /** The window ends at the newest ride: "last 9" is true. */
    newest: start + window.length === peers.length
  };
};

/** The feeling as a letter or two for the trend: Fr, Fo, T, or a dash when none was saved. */
export const feelingMark = (mood?: RideMoodRecord) => (mood === "fresh" ? "Fr" : mood === "focused" ? "Fo" : mood === "tender" ? "T" : "–");

const weekdayLong = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** The weekday of a local day, in full: "Tuesday". */
export const weekdayName = (day: string) => weekdayLong[isoWeekday(day) - 1] ?? "";

const startDay = (entry: RideEntry) => localDayOf(entry.startedAt) ?? localDayOf(entry.completedAt);

/**
 * "8 of your 9 Jumping rides with Daimon were on a Tuesday." Said only when
 * it is a habit: at least four rides, and most of them on that day.
 */
export const weekdayHabit = (rides: readonly RideEntry[], scope: CompareScope, words: CompareWords): string | null => {
  if (rides.length < 4) return null;
  const counts = new Map<number, number>();
  for (const ride of rides) {
    const day = startDay(ride);
    if (day) counts.set(isoWeekday(day), (counts.get(isoWeekday(day)) ?? 0) + 1);
  }
  const [weekday, count] = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0] ?? [0, 0];
  if (count < 3 || count * 10 < rides.length * 6) return null;
  const all = count === rides.length;
  return `${all ? "All" : count} of your ${rides.length} ${rideNoun(scope, words, true)} were on a ${weekdayLong[weekday - 1]}.`;
};

// The week it belonged to -------------------------------------------------------

export type RideWeek = {
  /** The ride's day as the calendar files it: the day it started. */
  day: string;
  days: WeekDay[];
  /** Activities that week on the ride's horse; every horse's for a ride without one. */
  rides: number;
  /** The states come from the horse's training week; otherwise only trained or rest. */
  planned: boolean;
};

/**
 * Monday to Sunday of the week the ride was in, as that week went: a day
 * trained, missed, off or rest, and only the days still ahead of today read
 * as planned. Without a plan for the horse that week, only the days trained
 * show, like the dots under Home's week.
 */
export const weekAround = (
  entry: RideEntry,
  entries: readonly RideEntry[],
  options: {
    today?: string;
    plan?: readonly PlanVersion[];
    timeOff?: readonly TimeOffPeriod[];
    /**
     * Every ride end the app knows, not just the journal's loaded page: the
     * oldest loaded week is usually only partly loaded, and its days ridden
     * before the page starts would otherwise read as missed.
     */
    completions?: readonly RideEnd[];
  } = {}
): RideWeek | null => {
  // The calendar files a ride on the day it started, so the card does too:
  // a ride from 23:40 to 00:25 belongs to the day it began.
  const day = activityDayOf(entry);
  if (!day) return null;
  const today = options.today ?? localToday();
  const otherEnds = (options.completions
    ? ridesForHorse(options.completions, entry.horseId)
    : ofHorse(entries, entry.horseId).map((ride) => ride.completedAt)
  ).filter((completedAt) => completedAt !== entry.completedAt);
  const ridden = rideDays(otherEnds);
  ridden.add(day);
  const week = weekOf(day);
  const versions = options.plan ? planForHorse(options.plan, entry.horseId) : [];
  const planned = entry.horseId === undefined ? Boolean(planOn(versions, day)) : Boolean(planOn(versions, day)?.days.length);
  const periods = options.timeOff ?? [];
  const days = week.map((date, index): WeekDay => {
    const onPlan = planned ? plannedOn(versions, date) : [];
    const due = onPlan.filter((item) => !timeOffOn(periods, item.horseId, date));
    const state: WeekDayState = ridden.has(date)
      ? "ridden"
      : due.length
        ? date < today ? "missed" : "planned"
        : onPlan.length ? "off" : "rest";
    return { day: date, weekday: index + 1, planned: onPlan, due, state, isToday: date === today };
  });
  const inWeek = new Set(week);
  return {
    day,
    days,
    // This ride, plus the horse's other rides that ended that week.
    rides: 1 + otherEnds.filter((completedAt) => {
      const ended = localDayOf(completedAt);
      return ended !== null && inWeek.has(ended);
    }).length,
    planned
  };
};

/**
 * Where the horse's streak stood on the day of the ride, and where it stands
 * today. Null when the horse had no training week that day: there was no
 * streak to be part of.
 */
export const streakAround = (
  entry: RideEntry,
  training: { versions: readonly PlanVersion[]; completions: readonly RideEnd[]; timeOff?: readonly TimeOffPeriod[] },
  today: string = localToday()
) => {
  const day = localDayOf(entry.completedAt);
  if (!day) return null;
  const then = trainingStreakFor(training.versions, training.completions, entry.horseId, day, training.timeOff ?? []);
  if (!then.hasPlan || then.current === 0) return null;
  const now = trainingStreakFor(training.versions, training.completions, entry.horseId, today, training.timeOff ?? []);
  return { day: then.current, now: now.current, best: now.best };
};

// Doing it again ----------------------------------------------------------------

/** The first day after today on the same weekday as `day`. */
export const nextSameWeekday = (day: string, today: string) => {
  const ahead = (isoWeekday(day) - isoWeekday(today) + 7) % 7;
  return addDays(today, ahead === 0 ? 7 : ahead);
};

/**
 * The days to offer for "Plan it again": the next one on this ride's
 * weekday, and the next on the other weekday the rider keeps for it, when
 * two or more of the peers fell on one. Soonest first.
 */
export const planAgainDays = (entry: RideEntry, peers: readonly RideEntry[], today: string): string[] => {
  const day = startDay(entry);
  if (!day) return [];
  const own = isoWeekday(day);
  const counts = new Map<number, number>();
  for (const peer of peers) {
    const peerDay = startDay(peer);
    if (!peerDay || peer.id === entry.id) continue;
    const weekday = isoWeekday(peerDay);
    if (weekday !== own) counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
  }
  const other = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
  const days = [nextSameWeekday(day, today)];
  if (other && other[1] >= 2) days.push(nextSameWeekday(addDays(day, other[0] - own), today));
  return days.sort();
};

/** Whether the horse already has something scheduled that day. */
export const scheduledOn = (
  planned: readonly Pick<PlannedActivity, "day" | "horseId" | "status">[],
  day: string,
  horseId: string | undefined
) => planned.some((item) =>
  item.status === "planned" &&
  item.day === day &&
  // No horse to plan for: only an activity without a horse blocks the day.
  (horseId === undefined ? !item.horseId : belongsTo(item, horseId))
);

const minutesInDay = 24 * 60;

/**
 * The ride as a plan again: its training and the phases as they were
 * planned (a logged activity's are the minutes typed), and the quarter hour
 * it started at. The setup sheet's limits apply, so an older row that
 * breaks them still opens.
 */
export const repeatPlanOf = (entry: RideEntry): { trainingType?: RideTrainingType; phases?: RidePhasePlan[]; startMinutes: number } => {
  const started = new Date(entry.startedAt);
  const minutes = Number.isNaN(started.getTime()) ? 9 * 60 : started.getHours() * 60 + started.getMinutes();
  const trainingType = entry.trainingType
    ? rideTrainingTypeById(entry.trainingType) ?? { id: entry.trainingType, label: rideTrainingLabel(entry.trainingType) ?? "Training" }
    : undefined;
  const phases = (entry.phases ?? []).slice(0, ridePhaseLimits.maxPhases).map((phase, index): RidePhasePlan => ({
    id: `repeat-${index}`,
    title: phase.title.slice(0, ridePhaseLimits.titleLength),
    detail: (phase.detail ?? "").slice(0, ridePhaseLimits.detailLength),
    minutes: Math.min(ridePhaseLimits.maxMinutes, Math.max(ridePhaseLimits.minMinutes, Math.round(phase.plannedSeconds / 60)))
  }));
  return {
    ...(trainingType ? { trainingType } : {}),
    ...(phases.length ? { phases } : {}),
    startMinutes: Math.min(minutesInDay - 15, Math.round(minutes / 15) * 15)
  };
};

// Asking Ralf ---------------------------------------------------------------------

/**
 * The comparison in the rider's words, for the message to Ralf. He reads only
 * the rider's newest rides on his own, without their training or phases, so
 * the peers travel in the message, as the ride itself does.
 */
export const comparisonForRalf = (comparison: RideComparison, scope: CompareScope, words: CompareWords): string[] => {
  const { baseline } = comparison;
  if (!baseline.length || comparison.averageMinutes === null) return [];
  const first = baseline[0];
  const last = baseline[baseline.length - 1];
  const span = first && last && first !== last ? ` (${rideDayLabel(first)} to ${rideDayLabel(last)})` : last ? ` (${rideDayLabel(last)})` : "";
  const one = baseline.length === 1;
  const facts: string[] = [one ? `it lasted ${comparison.averageMinutes} min` : `they averaged ${comparison.averageMinutes} min`];
  if (comparison.loggedInBaseline) {
    facts.push(one
      ? "I added it by hand"
      : comparison.loggedInBaseline === baseline.length
        ? "I added them by hand"
        : `${comparison.loggedInBaseline} of them I added by hand`);
  }
  const { timed, everyPhase } = comparison.phases;
  if (timed && one && last) {
    facts.push(everyPhase ? "I reached every phase" : `I reached ${last.completedPhases} of ${last.totalPhases} phases`);
  } else if (timed) {
    facts.push(timed === baseline.length
      ? `I reached every phase in ${everyPhase} of ${timed}`
      : `of the ${timed} the app timed, I reached every phase in ${everyPhase}`);
  }
  const top = comparison.feelings.tally[0];
  // Name the horse only when every ride compared was on it: across horses,
  // a tally of other horses' feelings must not read as this horse's.
  const subject = scope === "training" || !words.horse ? (one ? "the horse" : "the horses") : words.horse;
  facts.push(top
    ? one ? `${subject} felt ${top.mood}` : `${subject} felt ${top.mood} in ${top.rides} of ${baseline.length}`
    : `no feeling was saved for ${one ? "it" : "them"}`);
  const lines = [`Compared with ${lastRidesPhrase(scope, words, baseline.length).replace(/^your /, "my ")}${span}: ${facts.join("; ")}.`];
  const difference = comparison.minutes - comparison.averageMinutes;
  const moves = comparison.explains.map((move) => `${move.title} ${move.minutes > 0 ? "+" : "-"}${Math.abs(move.minutes)}`).join(", ");
  if (difference !== 0) {
    lines.push(`This one was ${Math.abs(difference)} min ${difference > 0 ? "longer" : "shorter"}${moves ? `: ${moves}` : ""}.`);
  } else {
    lines.push("This one was the same length.");
  }
  return lines;
};
