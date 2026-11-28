import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";
import type { RideEntry, RideMoodRecord } from "../../backend";
import { shortDayLabel } from "../../domain/local-day";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { useReducedMotion } from "../../ui/motion/useReducedMotion";
import { equinaTheme } from "../../ui/theme/theme";
import { WeekRow } from "../home/TrainingWeek";
import {
  dayLabel,
  everyPhaseLine,
  feelingLine,
  feelingMark,
  lastRidesPhrase,
  peerPosition,
  rideDayLabel,
  rideShortDay,
  rideTrend,
  scopeLabel,
  trainingWordOf,
  weekdayHabit,
  TREND_RIDES,
  type CompareBaseline,
  type ComparePhase,
  type CompareScope,
  type CompareWords,
  type RideComparison,
  type RideWeek,
  type TrendPoint
} from "./ride-compare";
import { rideMinutesLabel } from "./ride-review-prompt";

/**
 * The cards that put one ride among its siblings on the past-activity
 * screen (RideJournalSheet): where it sits, how it compares, the trend it
 * is part of, its phases against the usual, and the week it was in. The
 * numbers come from ride-compare.ts; this file only lays them out.
 */

const TAP_TARGET = equinaTheme.accessibility.minimumTapTarget;
const TRACK_HEIGHT = 32;
const TRACK_INSET = (TAP_TARGET - TRACK_HEIGHT) / 2;
// From the accessibility text sizes up, three tiles side by side cannot
// hold their numbers: they stack, as the ride summary's facts do.
const STACK_ABOVE_FONT_SCALE = 1.4;
// Chart labels share a narrow column each; larger text grows them only so far.
const CHART_TEXT_SCALE = 1.25;
const CHART_HEIGHT = 116;
// The tallest bar leaves room above it for its minutes, at the largest label size.
const BAR_HEIGHT = CHART_HEIGHT - 24;
const BAR_GROW_MS = 180;

export const moodWord: Record<RideMoodRecord, string> = { fresh: "Fresh", focused: "Focused", tender: "Tender" };

const NBSP = " ";
const signedMinutes = (minutes: number) => (minutes === 0 ? "same" : `${minutes > 0 ? "+" : "−"}${Math.abs(minutes)}${NBSP}min`);

/** Options side by side, each a full 44pt target with a smaller pill drawn inside it. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID
}: {
  options: ReadonlyArray<{ key: T; label: string; spoken: string }>;
  value: T;
  onChange: (next: T) => void;
  testID: string;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.toggle} testID={testID}>
      <View pointerEvents="none" style={styles.toggleTrack} />
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            testID={`${testID}-${option.key}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.spoken}
            onPress={() => {
              if (active) return;
              selectionHaptic();
              onChange(option.key);
            }}
            style={styles.toggleOption}
          >
            <View style={[styles.toggleChip, active && styles.toggleChipActive]}>
              <Text maxFontSizeMultiplier={1.6} style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{option.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// The stepper ---------------------------------------------------------------------

/**
 * "‹ 27 Oct | Jumping with Daimon · 6 of 9 | 10 Nov ›": the ride before and
 * after this one in place, and which rides count as its siblings. The
 * centre opens the choice of siblings; nothing is saved by it.
 */
export function RideStepper({
  entry,
  peers,
  scope,
  scopes,
  words,
  onStep,
  onScope
}: {
  entry: RideEntry;
  peers: readonly RideEntry[];
  scope: CompareScope;
  /** The scopes this ride can take: the horse ones only for a ride with a horse. */
  scopes: readonly CompareScope[];
  words: CompareWords;
  onStep: (entry: RideEntry) => void;
  onScope: (scope: CompareScope) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const stacked = useWindowDimensions().fontScale > STACK_ABOVE_FONT_SCALE;
  const { index, count, previous, next } = peerPosition(peers, entry);
  const label = scopeLabel(scope, words);
  const where = `${index + 1} of ${count}`;
  const step = (target: RideEntry) => {
    selectionHaptic();
    onStep(target);
    // The screen changes under the reader: say which ride it is now.
    AccessibilityInfo.announceForAccessibility(`${trainingWordOf(target)}, ${rideDayLabel(target)}`);
  };
  const side = (target: RideEntry | undefined, direction: "previous" | "next") => target ? (
    <MotionPressable
      testID={`ride-stepper-${direction}`}
      accessibilityRole="button"
      accessibilityLabel={`${direction === "previous" ? "Previous" : "Next"} ride: ${trainingWordOf(target)}, ${rideDayLabel(target)}`}
      onPress={() => step(target)}
      style={[styles.stepSide, direction === "next" && styles.stepSideNext]}
    >
      {direction === "previous" ? <ChevronLeft size={18} color={equinaTheme.text.secondary} /> : null}
      <Text maxFontSizeMultiplier={CHART_TEXT_SCALE} style={styles.stepDay}>{rideShortDay(target)}</Text>
      {direction === "next" ? <ChevronRight size={18} color={equinaTheme.text.secondary} /> : null}
    </MotionPressable>
  ) : <View style={styles.stepSide} />;

  return (
    <View style={styles.stepper}>
      <View style={[styles.stepRow, stacked && styles.stepRowStacked]}>
        {stacked ? null : side(previous, "previous")}
        <MotionPressable
          testID="ride-stepper-scope"
          accessibilityRole="button"
          accessibilityLabel={count > 1 ? `${label}, ride ${where}` : `${label}, the only one so far`}
          accessibilityHint={scopes.length > 1 ? "Changes which rides this one is shown among" : undefined}
          accessibilityState={{ expanded: choosing, disabled: scopes.length <= 1 }}
          disabled={scopes.length <= 1}
          onPress={() => {
            selectionHaptic();
            setChoosing((open) => !open);
          }}
          style={styles.stepCentre}
        >
          <View style={styles.stepLabelLine}>
            <Text style={styles.stepLabel} numberOfLines={stacked ? undefined : 1}>{label}</Text>
            {scopes.length > 1 ? <ChevronDown size={15} color={equinaTheme.colors.brass} /> : null}
          </View>
          <Text style={styles.stepCount}>{count > 1 ? where : "The only one so far"}</Text>
        </MotionPressable>
        {stacked ? (
          <View style={styles.stepStackedSides}>
            {side(previous, "previous")}
            {side(next, "next")}
          </View>
        ) : side(next, "next")}
      </View>
      {choosing ? (
        <View accessibilityRole="radiogroup" style={styles.scopeChoices}>
          {scopes.map((option) => {
            const selected = option === scope;
            return (
              <MotionPressable
                key={option}
                testID={`ride-stepper-scope-${option}`}
                accessibilityRole="radio"
                accessibilityLabel={scopeLabel(option, words)}
                accessibilityState={{ selected }}
                pressedScale={0.97}
                onPress={() => {
                  if (!selected) selectionHaptic();
                  setChoosing(false);
                  onScope(option);
                }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>{scopeLabel(option, words)}</Text>
              </MotionPressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// The compare strip -----------------------------------------------------------------

const baselines: ReadonlyArray<{ key: CompareBaseline; label: string; spoken: string }> = [
  { key: "average", label: "Average", spoken: "Compare with the average" },
  { key: "best", label: "Best", spoken: "Compare with the longest" },
  { key: "previous", label: "Previous", spoken: "Compare with the ride before" }
];

type Tile = { label: string; value: string; lines: string[] };

const tilesFor = (entry: RideEntry, comparison: RideComparison): Tile[] => {
  const { reference, deltaMinutes } = comparison;
  const previous = comparison.baseline[comparison.baseline.length - 1];
  const phases = comparison.phases.total > 0 ? `${comparison.phases.reached} of ${comparison.phases.total}` : "–";
  const minutesLines = comparison.kind === "previous" && reference?.entry
    ? [`${reference.minutes} min on ${rideDayLabel(reference.entry)}`]
    : comparison.kind === "best" && reference
      ? [`longest ${reference.minutes}`]
      : reference ? [`usual ${reference.minutes}`] : [];
  if (deltaMinutes !== null) minutesLines.push(signedMinutes(deltaMinutes));
  const phaseLines = comparison.kind === "previous" && previous
    ? [previous.totalPhases === 0
        ? "none last time"
        : previous.completedPhases === comparison.phases.reached && previous.totalPhases === comparison.phases.total
          ? "same as last time"
          : `${previous.completedPhases} of ${previous.totalPhases} last time`]
    : [everyPhaseLine(comparison)].filter((line): line is string => Boolean(line));
  const feelingLines = comparison.kind === "previous" && previous
    ? [previous.mood ? `last time ${previous.mood}` : "none saved last time"]
    : [feelingLine(comparison)];
  return [
    { label: "Minutes", value: String(comparison.minutes), lines: minutesLines },
    { label: "Phases", value: phases, lines: phaseLines },
    { label: "Feeling", value: entry.mood ? moodWord[entry.mood] : "–", lines: feelingLines }
  ];
};

/** Minutes, phases and feeling against the rides before, in words as well as numbers. */
export function CompareStrip({
  entry,
  comparison,
  scope,
  words,
  since,
  onBaseline
}: {
  entry: RideEntry;
  comparison: RideComparison;
  scope: CompareScope;
  words: CompareWords;
  /** "1 Oct" when the journal on the phone starts there and holds fewer rides than were saved. */
  since?: string;
  onBaseline: (baseline: CompareBaseline) => void;
}) {
  const stacked = useWindowDimensions().fontScale > STACK_ABOVE_FONT_SCALE;
  const count = comparison.baseline.length;
  if (count === 0) {
    const noun = lastRidesPhrase(scope, words, 1).replace(/^your last /, "");
    return (
      <View style={styles.card} testID="ride-compare-first">
        <Text style={styles.body}>
          {`Your first ${noun}${since ? ` since ${since}` : ""}. Next time you'll see how they compare.`}
        </Text>
      </View>
    );
  }
  const tiles = tilesFor(entry, comparison);
  return (
    <View style={styles.card} testID="ride-compare">
      <View style={styles.cardTop}>
        <Text accessibilityRole="header" style={styles.sectionLabel}>
          {`Against ${lastRidesPhrase(scope, words, count)}`}
        </Text>
        <Segmented testID="ride-compare-baseline" options={baselines} value={comparison.kind} onChange={onBaseline} />
      </View>
      <View style={[styles.tiles, stacked && styles.tilesStacked]}>
        {tiles.map((tile) => (
          <View
            key={tile.label}
            accessible
            accessibilityLabel={`${tile.label}: ${tile.value === "–" ? "none" : tile.value}${tile.lines.length ? `, ${tile.lines.join(", ").replace(/−/g, "minus ")}` : ""}`}
            style={[styles.tile, stacked && styles.tileStacked]}
          >
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.tileValue}>{tile.value}</Text>
            {tile.lines.map((line) => <Text key={line} style={styles.tileLine}>{line}</Text>)}
          </View>
        ))}
      </View>
      {comparison.logged ? (
        <Text style={styles.footnote}>This one was added by hand: its minutes were typed, not timed.</Text>
      ) : comparison.loggedInBaseline ? (
        <Text style={styles.footnote}>
          {comparison.loggedInBaseline === 1 ? "One of them was added by hand: its minutes were typed, not timed." : `${comparison.loggedInBaseline} of them were added by hand: their minutes were typed, not timed.`}
        </Text>
      ) : null}
      {since ? <Text style={styles.footnote}>From your rides since {since}.</Text> : null}
    </View>
  );
}

// The trend -------------------------------------------------------------------------

export type TrendMetric = "minutes" | "phases" | "feeling";

const metrics: ReadonlyArray<{ key: TrendMetric; label: string; spoken: string }> = [
  { key: "minutes", label: "Minutes", spoken: "Show minutes" },
  { key: "phases", label: "Phases", spoken: "Show phases reached" },
  { key: "feeling", label: "Feeling", spoken: "Show how the horse felt" }
];

const pointWords = (point: TrendPoint) => [
  rideDayLabel(point.entry),
  `${rideMinutesLabel(point.entry.elapsedSeconds)} ${point.logged ? "logged" : "timed"}`,
  point.total > 0 ? `${point.reached} of ${point.total}` : null,
  point.mood ? `felt ${point.mood}` : "no feeling saved"
].filter(Boolean).join(" · ");

const trendSummary = (points: readonly TrendPoint[], metric: TrendMetric) => {
  if (metric === "minutes") {
    const minutes = points.map((point) => point.minutes);
    return `${Math.min(...minutes)} to ${Math.max(...minutes)} min over ${points.length} rides`;
  }
  if (metric === "phases") {
    const timed = points.filter((point) => !point.logged && point.total > 0);
    if (!timed.length) return "Every ride here was added by hand, so every phase is recorded";
    return `Every phase reached in ${timed.filter((point) => point.reached >= point.total).length} of ${timed.length} timed rides`;
  }
  const saved = points.filter((point) => point.mood);
  if (!saved.length) return "No feeling saved for these rides";
  const counts = new Map<RideMoodRecord, number>();
  for (const point of saved) if (point.mood) counts.set(point.mood, (counts.get(point.mood) ?? 0) + 1);
  // Equal counts read in the chips' order, so the line does not change with the rides' order.
  const order: readonly RideMoodRecord[] = ["fresh", "focused", "tender"];
  const [mood, rides] = [...counts.entries()].sort((left, right) => right[1] - left[1] || order.indexOf(left[0]) - order.indexOf(right[0]))[0] ?? ["focused", 0];
  return `${moodWord[mood]} in ${rides} of ${points.length} rides`;
};

/**
 * The siblings as bars, built from plain Views: minutes, phases reached,
 * or the feeling. A bar picks a ride and its facts show under the chart,
 * with a way to open it. Every bar is a button with the same facts in its
 * label, and the summary line says the whole trend in words first.
 */
export function TrendCard({
  entry,
  peers,
  usualMinutes,
  metric,
  scope,
  words,
  onMetric,
  onOpen
}: {
  entry: RideEntry;
  peers: readonly RideEntry[];
  /** The dashed line: the average of the rides before this one. */
  usualMinutes: number | null;
  metric: TrendMetric;
  scope: CompareScope;
  words: CompareWords;
  onMetric: (metric: TrendMetric) => void;
  onOpen: (entry: RideEntry) => void;
}) {
  const reducedMotion = useReducedMotion();
  // As many bars as fit at a full tap target each: nine on a wide phone, fewer on a narrow one.
  const [width, setWidth] = useState(0);
  const fit = width > 0 ? Math.max(3, Math.min(TREND_RIDES, Math.floor(width / TAP_TARGET))) : 7;
  const { points, newest } = rideTrend(entry, peers, fit);
  const [selectedId, setSelectedId] = useState(entry.id);
  const selected = points.find((point) => point.entry.id === selectedId) ?? points.find((point) => point.current);
  const grow = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      grow.setValue(1);
      return;
    }
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: BAR_GROW_MS,
      easing: Easing.out(Easing.cubic),
      // Heights cannot run on the native driver.
      useNativeDriver: false
    }).start();
  }, [metric, reducedMotion, grow]);

  const most = Math.max(1, ...points.map((point) => point.minutes), usualMinutes ?? 0);
  const habit = weekdayHabit(points.map((point) => point.entry), scope, words);
  const heading = `${scopeLabel(scope, words)} · ${newest ? `last ${points.length}` : `${points.length} rides`}`;

  return (
    <View style={styles.card} testID="ride-trend">
      <View style={styles.cardTop}>
        <Text accessibilityRole="header" style={styles.sectionLabel}>{heading}</Text>
        <Segmented testID="ride-trend-metric" options={metrics} value={metric} onChange={onMetric} />
      </View>
      <Text style={styles.trendSummary}>{trendSummary(points, metric)}</Text>
      <View
        style={styles.chart}
        onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      >
        {points.map((point, index) => {
          const isSelected = point.entry.id === selected?.entry.id;
          const day = rideShortDay(point.entry);
          // The month only where it changes, so a narrow column holds its label.
          const month = day.split(" ")[1];
          const shownDay = index === 0 || month !== rideShortDay(points[index - 1]!.entry).split(" ")[1] ? day : day.split(" ")[0];
          return (
            <Pressable
              key={point.entry.id}
              testID={`ride-trend-bar-${point.entry.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${pointWords(point)}${point.current ? ", this ride" : ""}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                if (isSelected) return;
                selectionHaptic();
                setSelectedId(point.entry.id);
              }}
              style={[styles.column, isSelected && styles.columnSelected]}
            >
              <View style={styles.columnPlot}>
                {metric === "minutes" && usualMinutes !== null ? (
                  // Each column draws its stretch of the usual line: together they read as one.
                  <View pointerEvents="none" style={[styles.usualLine, { bottom: (usualMinutes / most) * BAR_HEIGHT }]}>
                    {Array.from({ length: 5 }, (_, dash) => <View key={dash} style={styles.usualDash} />)}
                  </View>
                ) : null}
                {metric === "minutes" ? (
                  <>
                    <Text maxFontSizeMultiplier={CHART_TEXT_SCALE} style={[styles.barValue, point.current && styles.columnLabelCurrent]}>{point.minutes}</Text>
                    <Animated.View
                      style={[
                        styles.bar,
                        point.logged ? styles.barLogged : styles.barTimed,
                        point.current && (point.logged ? styles.barCurrentLogged : styles.barCurrent),
                        { height: grow.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(4, (point.minutes / most) * BAR_HEIGHT)] }) }
                      ]}
                    />
                  </>
                ) : metric === "phases" ? (
                  <Animated.View style={[styles.dots, { opacity: grow }]}>
                    {Array.from({ length: Math.min(8, point.total) }, (_, dot) => (
                      <View
                        key={dot}
                        style={[
                          styles.dot,
                          dot < point.reached && (point.logged ? styles.dotLogged : styles.dotReached),
                          dot < point.reached && point.current && styles.dotCurrent
                        ]}
                      />
                    ))}
                  </Animated.View>
                ) : (
                  <Animated.View style={[styles.mark, point.mood && styles.markSaved, point.current && styles.markCurrent, { opacity: grow }]}>
                    <Text maxFontSizeMultiplier={CHART_TEXT_SCALE} style={[styles.markText, point.current && styles.markTextCurrent]}>{feelingMark(point.mood)}</Text>
                  </Animated.View>
                )}
              </View>
              <Text maxFontSizeMultiplier={CHART_TEXT_SCALE} numberOfLines={1} style={[styles.columnLabel, point.current && styles.columnLabelCurrent]}>
                {shownDay}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {selected ? (
        <View style={styles.caption}>
          <Text style={styles.captionText}>{pointWords(selected)}</Text>
          {!selected.current ? (
            <MotionPressable
              testID="ride-trend-open"
              accessibilityRole="button"
              accessibilityLabel={`Open ${trainingWordOf(selected.entry)}, ${rideDayLabel(selected.entry)}`}
              onPress={() => {
                selectionHaptic();
                onOpen(selected.entry);
              }}
              style={styles.captionOpen}
            >
              <Text style={styles.link}>Open</Text>
              <ChevronRight size={15} color={equinaTheme.colors.brass} />
            </MotionPressable>
          ) : null}
        </View>
      ) : null}
      {habit ? <Text style={styles.footnote}>{habit}</Text> : null}
    </View>
  );
}

// The phases ------------------------------------------------------------------------

/**
 * Each phase of this ride next to its usual time: two thin bars, brass for
 * this ride and an outline for the usual. The usual is what the clock
 * measured on the rides before, never minutes typed in.
 */
export function PhasesCard({ entry, comparison }: { entry: RideEntry; comparison: RideComparison | null }) {
  const manual = entry.source === "manual";
  const rows: ComparePhase[] = comparison?.phaseRows ?? (entry.phases ?? []).map((phase) => ({
    title: phase.title,
    ...(phase.detail ? { detail: phase.detail } : {}),
    plannedSeconds: phase.plannedSeconds,
    ...(phase.actualSeconds !== undefined ? { seconds: phase.actualSeconds } : {}),
    matched: 0
  }));
  if (!rows.length) return null;
  const comparing = Boolean(comparison && comparison.phaseRides > 0);
  const longest = Math.max(1, ...rows.map((row) => Math.max(row.seconds ?? 0, row.usualSeconds ?? 0, row.plannedSeconds)));
  return (
    <View style={styles.card} testID="ride-phases">
      <Text accessibilityRole="header" style={styles.sectionLabel}>{comparing ? "Phases, this ride and usual" : "Phases"}</Text>
      {rows.map((row, index) => {
        const name = [row.title, row.detail].filter(Boolean).join(" · ");
        const planned = rideMinutesLabel(row.plannedSeconds);
        const ridden = row.seconds === undefined
          ? `${planned} planned, not reached`
          : manual || rideMinutesLabel(row.seconds) === planned
            ? rideMinutesLabel(row.seconds)
            : `${rideMinutesLabel(row.seconds)} ridden, ${planned} planned`;
        const difference = row.seconds !== undefined && row.usualSeconds !== undefined
          ? Math.round(row.seconds / 60) - Math.round(row.usualSeconds / 60)
          : 0;
        const usual = !comparing
          ? null
          : row.usualSeconds === undefined
            ? "new this time"
            : `usual ${Math.round(row.usualSeconds / 60)}${difference ? ` (${difference > 0 ? "+" : "−"}${Math.abs(difference)})` : ""}`;
        return (
          <View
            key={`${index}-${row.title}`}
            accessible
            accessibilityLabel={`${name}: ${ridden}${usual ? `, ${usual.replace(/−/g, "minus ")}` : ""}`}
            style={styles.phase}
          >
            <Text style={styles.phaseName}>{name}</Text>
            <Text style={styles.meta}>{usual ? `${ridden} · ${usual}` : ridden}</Text>
            {comparing ? (
              <View style={styles.phaseBars}>
                <View style={styles.phaseTrack}>
                  <View style={[styles.phaseThis, { width: `${((row.seconds ?? 0) / longest) * 100}%` }]} />
                </View>
                <View style={styles.phaseTrack}>
                  {row.usualSeconds !== undefined ? (
                    <View style={[styles.phaseUsual, { width: `${(row.usualSeconds / longest) * 100}%` }]} />
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      {comparison?.phaseSummary ? <Text style={styles.body}>{comparison.phaseSummary.replace(/-/g, "\u2011")}</Text> : null}
      {comparison && comparison.baseline.length > 0 && comparison.phaseRides === 0 ? (
        <Text style={styles.footnote}>No timed ride before this one to compare phases with yet.</Text>
      ) : null}
    </View>
  );
}

// The week ----------------------------------------------------------------------------

/**
 * The week the ride was in, with the streak as it stood that day where the
 * horse had a training week. Without one, only the days trained show.
 */
export function RideWeekCard({
  week,
  streak,
  horse,
  onOpenDay
}: {
  week: RideWeek;
  streak: { day: number; now: number; best: number } | null;
  horse?: string;
  onOpenDay?: (day: string) => void;
}) {
  const monday = week.days[0]?.day ?? week.day;
  const ridesLine = `${week.rides} ${week.rides === 1 ? "ride" : "rides"} that week`;
  const streakLine = streak ? `this was training day ${streak.day} of ${horse ? `${horse}'s` : "your"} streak` : null;
  return (
    <View style={styles.card} testID="ride-week">
      <View style={styles.weekTop}>
        <Text accessibilityRole="header" style={styles.sectionLabel}>Week of {shortDayLabel(monday)}</Text>
        {onOpenDay ? (
          <MotionPressable
            testID="ride-week-calendar"
            accessibilityRole="button"
            accessibilityLabel={`Open the calendar on ${dayLabel(week.day)}`}
            onPress={() => {
              selectionHaptic();
              onOpenDay(week.day);
            }}
            style={styles.weekLink}
          >
            <CalendarDays size={15} strokeWidth={2} color={equinaTheme.colors.brass} />
            <Text maxFontSizeMultiplier={1.4} style={styles.link}>Calendar</Text>
          </MotionPressable>
        ) : null}
      </View>
      <WeekRow week={week.days} marked={week.day} />
      <Text style={styles.body}>{[ridesLine, streakLine].filter(Boolean).join(" · ")}</Text>
      {streak ? <Text style={styles.footnote}>{`Now ${streak.now} · best ${streak.best}`}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.material.quiet,
    paddingVertical: equinaTheme.spacing.compact,
    paddingHorizontal: equinaTheme.spacing.md,
    gap: equinaTheme.spacing.sm
  },
  // The toggle's targets reach TRACK_INSET below the pill drawn in them.
  cardTop: {
    alignItems: "flex-start",
    marginBottom: -TRACK_INSET
  },
  sectionLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  body: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary
  },
  meta: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  footnote: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  },
  link: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  toggle: { flexDirection: "row" },
  toggleTrack: {
    ...StyleSheet.absoluteFillObject,
    top: TRACK_INSET,
    bottom: TRACK_INSET,
    backgroundColor: equinaTheme.material.quiet,
    borderRadius: equinaTheme.radius.compact + 2
  },
  toggleOption: {
    minHeight: TAP_TARGET,
    minWidth: TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  toggleChip: {
    minHeight: TRACK_HEIGHT - 4,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: equinaTheme.spacing.sm,
    borderRadius: equinaTheme.radius.compact
  },
  toggleChipActive: { backgroundColor: equinaTheme.material.selected },
  toggleLabel: { ...equinaTheme.typography.label, color: equinaTheme.text.tertiary },
  toggleLabelActive: { color: equinaTheme.colorRole.accent },
  stepper: { gap: equinaTheme.spacing.sm },
  stepRow: {
    minHeight: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.xs
  },
  stepRowStacked: { flexDirection: "column", alignItems: "stretch" },
  stepStackedSides: { flexDirection: "row", justifyContent: "space-between" },
  stepSide: {
    minHeight: TAP_TARGET,
    minWidth: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  stepSideNext: { justifyContent: "flex-end" },
  stepDay: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  stepCentre: {
    flex: 1,
    minWidth: 0,
    minHeight: TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: equinaTheme.spacing.xs
  },
  stepLabelLine: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.xs
  },
  stepLabel: {
    ...equinaTheme.typography.meta,
    flexShrink: 1,
    color: equinaTheme.text.primary,
    fontWeight: "600",
    textAlign: "center"
  },
  stepCount: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  scopeChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: equinaTheme.spacing.sm
  },
  chip: {
    minHeight: TAP_TARGET,
    maxWidth: "100%",
    paddingHorizontal: 14,
    borderRadius: equinaTheme.radius.pill,
    borderWidth: 1,
    borderColor: equinaTheme.material.fieldBorder,
    alignItems: "center",
    justifyContent: "center"
  },
  chipSelected: {
    borderColor: equinaTheme.colors.brass,
    backgroundColor: equinaTheme.material.selected
  },
  chipText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  chipTextSelected: { color: equinaTheme.colors.brass },
  tiles: { flexDirection: "row", gap: equinaTheme.spacing.sm },
  tilesStacked: { flexDirection: "column" },
  tile: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    padding: equinaTheme.spacing.sm,
    borderRadius: equinaTheme.radius.compact,
    backgroundColor: equinaTheme.material.quiet
  },
  tileStacked: { flex: 0 },
  tileLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.tertiary,
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  tileValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  tileLine: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  trendSummary: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end"
  },
  usualLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    overflow: "hidden"
  },
  usualDash: {
    width: 4,
    height: 1,
    backgroundColor: "rgba(247,243,234,0.46)"
  },
  column: {
    flex: 1,
    minWidth: TAP_TARGET,
    alignItems: "center",
    gap: 4,
    paddingBottom: 4,
    borderRadius: equinaTheme.radius.compact
  },
  columnSelected: { backgroundColor: equinaTheme.material.quietPressed },
  columnPlot: {
    height: CHART_HEIGHT,
    alignSelf: "stretch",
    justifyContent: "flex-end",
    alignItems: "center"
  },
  barValue: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    fontVariant: ["tabular-nums"],
    marginBottom: 2
  },
  bar: {
    width: 14,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4
  },
  barTimed: { backgroundColor: "rgba(247,243,234,0.32)" },
  // Logged minutes are typed, not timed: an outline, never the same fill.
  barLogged: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(247,243,234,0.6)",
    backgroundColor: "transparent"
  },
  barCurrent: { backgroundColor: equinaTheme.colors.brass },
  barCurrentLogged: { borderColor: equinaTheme.colors.brass, backgroundColor: "rgba(196,160,90,0.22)" },
  dots: { gap: 3, alignItems: "center", paddingVertical: 4 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.46)"
  },
  dotReached: { backgroundColor: "rgba(247,243,234,0.72)", borderColor: "transparent" },
  dotLogged: { borderColor: "rgba(247,243,234,0.72)" },
  dotCurrent: { backgroundColor: equinaTheme.colors.brass, borderColor: equinaTheme.colors.brass },
  mark: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: equinaTheme.material.separator
  },
  markSaved: { borderColor: "rgba(247,243,234,0.36)", backgroundColor: equinaTheme.material.quiet },
  markCurrent: { borderColor: equinaTheme.colors.brass },
  markText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  markTextCurrent: { color: equinaTheme.colors.brass },
  columnLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.tertiary,
    fontVariant: ["tabular-nums"]
  },
  columnLabelCurrent: { color: equinaTheme.colors.brass },
  caption: {
    minHeight: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.sm
  },
  captionText: {
    ...equinaTheme.typography.meta,
    flex: 1,
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  captionOpen: {
    minHeight: TAP_TARGET,
    minWidth: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2
  },
  phase: { gap: 4 },
  phaseName: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  phaseBars: { gap: 3 },
  phaseTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  phaseThis: { height: 4, borderRadius: 2, backgroundColor: equinaTheme.colors.brass },
  phaseUsual: { height: 4, borderRadius: 2, borderWidth: 1, borderColor: "rgba(247,243,234,0.6)" },
  weekTop: {
    minHeight: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: -TRACK_INSET
  },
  weekLink: {
    minHeight: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  }
});
