import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { Lock } from "lucide-react-native";
import type { RideEntry } from "../../backend";
import { EquinaButton } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { useReducedMotion } from "../../ui/motion/useReducedMotion";
import { equinaTheme } from "../../ui/theme/theme";
import { effortChartLayout, ribbonFits } from "./effort-chart";
import { sourceChipSpoken } from "./health-workouts";
import {
  effortChartSteps,
  effortFootnotes,
  effortInsight,
  effortPhaseName,
  effortStatsSpoken,
  effortWords,
  noEffortMessage,
  rideEffortState,
  type RideEffort
} from "./ride-effort";
import type { RideEffortController } from "./useAppleHealth";

/**
 * "Your effort" on a past ride: the rider's heart rate and active calories
 * from Apple Health, across the ride's phases. "Your" every time: the
 * journal is about a horse, and these numbers are the rider's own.
 *
 * Apple Health is named in words only, never with a copy of its icon or its
 * permission sheet; Connect opens Apple's own sheet.
 */

const PLOT_HEIGHT = 112;
const STACK_ABOVE_FONT_SCALE = 1.4;
const DRAW_IN_MS = 400;
// Axis and band numbers share a 112 pt plot; larger text grows them only so far.
const CHART_TEXT_SCALE = 1.25;

export function RideEffortCard({
  entry,
  effort: controller,
  horse,
  onManage,
  ralfGetsEffort = false
}: {
  entry: RideEntry;
  effort: RideEffortController;
  horse?: string;
  /** Account › Privacy and Ralf, where showing, saving and Ralf's use are turned off. */
  onManage?: () => void;
  /**
   * The rider said yes to Ralf getting these numbers and Minimal context is
   * off (ralfMayUseEffort): "only you" then says Ralf gets them too.
   */
  ralfGetsEffort?: boolean;
}) {
  const { view } = controller;
  const manual = entry.source === "manual";
  const announced = useRef<string | null>(null);
  const shown = view.kind === "ready" ? view.effort : view.kind === "reading" ? view.effort : undefined;
  const state = shown ? rideEffortState(shown) : null;

  // Said once per ride, as the reading lands: the card's own title when there
  // is nothing, or what was added ("Calories added to this ride").
  const spokenNow = !shown || view.kind !== "ready"
    ? null
    : state === "none"
      ? noEffortMessage({ window: shown.window, manual, now: Date.now() }).title
      : `${capitalized(effortWords(shown))} added to this ride`;
  useEffect(() => {
    if (!spokenNow) return;
    const key = `${entry.id}:${spokenNow}`;
    if (announced.current === key) return;
    announced.current = key;
    AccessibilityInfo.announceForAccessibility(spokenNow);
  }, [entry.id, spokenNow]);

  if (view.kind === "off") return null;

  if (view.kind === "connect") {
    return (
      <View style={styles.card} testID="ride-effort-connect">
        <Text accessibilityRole="header" style={styles.title}>Add your heart rate to your rides</Text>
        <Text style={styles.body}>
          Wear your Apple Watch when you ride and Equina shows your heart rate across each phase and your active calories, from Apple Health. Rides you time are saved there as workouts.
        </Text>
        <Text style={styles.body}>
          {`It's your heart rate, not ${horse ? `${horse}'s` : "your horse's"}. ${ralfGetsEffort ? "Only you see it. Ralf gets it when you ask about a ride." : "Only you see it, on this iPhone."}`}
        </Text>
        <EquinaButton testID="ride-effort-connect-button" label="Connect Apple Health" onPress={controller.connect} />
        <MotionPressable
          testID="ride-effort-not-now"
          accessibilityRole="button"
          accessibilityLabel="Not now"
          accessibilityHint="Hides this for good. You can still turn it on in Account."
          onPress={() => {
            selectionHaptic();
            controller.dismiss();
          }}
          style={styles.textButton}
        >
          <Text style={styles.textButtonLabel}>Not now</Text>
        </MotionPressable>
        <Text style={styles.footnote}>Apple Health asks what to share. You can change it anytime in the Apple Health app.</Text>
      </View>
    );
  }

  if (!shown) {
    if (view.kind === "unreadable") {
      return (
        <View style={styles.card} testID="ride-effort-unreadable">
          <Text accessibilityRole="header" style={styles.sectionLabel}>Your effort</Text>
          <Text style={styles.rowTitle}>Apple Health can't be read right now</Text>
          <Text style={styles.meta}>It opens when your iPhone is unlocked. Check again in a moment.</Text>
          <CheckAgain onPress={controller.checkAgain} />
        </View>
      );
    }
    return (
      <View style={styles.card} testID="ride-effort-reading">
        <Text accessibilityRole="header" style={styles.sectionLabel}>Your effort</Text>
        <View style={styles.readingRow} accessible accessibilityLabel="Looking in Apple Health">
          <ActivityIndicator size="small" color={equinaTheme.colors.brass} />
          <Text style={styles.meta}>Looking in Apple Health…</Text>
        </View>
      </View>
    );
  }

  if (state === "none") {
    const message = noEffortMessage({ window: shown.window, manual, now: Date.now() });
    return (
      <View style={styles.card} testID="ride-effort-none">
        <Text accessibilityRole="header" style={styles.sectionLabel}>Your effort</Text>
        <Text style={styles.rowTitle}>{message.title}</Text>
        <Text style={styles.meta}>{message.body}</Text>
        <CheckAgain onPress={controller.checkAgain} busy={view.kind === "reading"} />
      </View>
    );
  }

  return <EffortDetails entry={entry} effort={shown} controller={controller} onManage={onManage} ralfGetsEffort={ralfGetsEffort} />;
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function CheckAgain({ onPress, busy = false }: { onPress: () => void; busy?: boolean }) {
  return (
    <MotionPressable
      testID="ride-effort-check-again"
      accessibilityRole="button"
      accessibilityLabel="Check Apple Health again"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      style={styles.textButton}
    >
      <Text style={styles.textButtonLabel}>{busy ? "Checking…" : "Check again"}</Text>
    </MotionPressable>
  );
}

function EffortDetails({
  entry,
  effort,
  controller,
  onManage,
  ralfGetsEffort
}: {
  entry: RideEntry;
  effort: RideEffort;
  controller: RideEffortController;
  onManage?: () => void;
  ralfGetsEffort: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_ABOVE_FONT_SCALE;
  const state = rideEffortState(effort);
  const spoken = effortStatsSpoken(effort);
  const insight = effortInsight(effort, controller.windows, entry.phases);
  const notes = effortFootnotes(effort, { placement: controller.placement, phases: entry.phases });
  const stats = [
    { key: "avg", value: effort.avgBpm, label: "avg bpm", spoken: spoken.avg },
    { key: "max", value: effort.maxBpm, label: "max bpm", spoken: spoken.max },
    { key: "kcal", value: effort.activeKcal, label: "active kcal", spoken: spoken.kcal }
  ];

  return (
    <View style={styles.card} testID="ride-effort">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.sectionLabel}>Your effort</Text>
        {effort.sourceLabel ? (
          <Text
            accessibilityLabel={sourceChipSpoken(effort.sourceLabel)}
            numberOfLines={1}
            style={styles.chip}
          >
            {effort.sourceLabel}
          </Text>
        ) : null}
      </View>
      <View style={styles.privacy}>
        <Lock size={12} strokeWidth={2} color={equinaTheme.text.secondary} />
        <Text style={[styles.meta, styles.privacyText]}>
          {ralfGetsEffort ? "Only you see this. Ralf gets it when you ask about a ride." : "Only you see this"}
        </Text>
        {onManage ? (
          <>
            <Text style={styles.meta}> · </Text>
            <MotionPressable
              testID="ride-effort-manage"
              accessibilityRole="button"
              accessibilityLabel="Manage your effort settings"
              accessibilityHint="Opens Privacy and Ralf in Account."
              onPress={() => {
                selectionHaptic();
                onManage();
              }}
              style={styles.manage}
            >
              <Text style={styles.manageText}>Manage</Text>
            </MotionPressable>
          </>
        ) : null}
      </View>

      <View style={[styles.stats, stacked && styles.statsStacked]}>
        {stats.map((stat) => (
          <View key={stat.key} accessible accessibilityLabel={stat.spoken} style={[styles.stat, stacked && styles.statStacked]}>
            <Text style={styles.statValue}>{stat.value ?? "—"}</Text>
            <Text style={styles.meta}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {state === "dense" || state === "sparse" ? (
        <EffortChart entry={entry} effort={effort} controller={controller} />
      ) : null}

      {insight ? <Text style={styles.body}>{insight}</Text> : null}
      {notes.map((note) => (
        <Text key={note} style={styles.footnote}>{note}</Text>
      ))}
    </View>
  );
}

function EffortChart({
  entry,
  effort,
  controller
}: {
  entry: RideEntry;
  effort: RideEffort;
  controller: RideEffortController;
}) {
  const [width, setWidth] = useState(0);
  const [step, setStep] = useState(0);
  const { fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const reveal = useRef(new Animated.Value(0)).current;
  const layout = width > 0 ? effortChartLayout(effort, controller.windows, entry.phases, { width, height: PLOT_HEIGHT }) : null;
  const steps = effortChartSteps(effort, controller.windows, entry.phases);
  const dense = effort.dense;
  const estimated = controller.placement !== "timed";
  const fits = layout ? ribbonFits(layout.bands, fontScale) : true;

  // The line draws in from the left, once per ride (not again on each new
  // read of the same ride), unless Reduce Motion is on.
  useEffect(() => {
    if (!width) return;
    if (reducedMotion) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: DRAW_IN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [entry.id, reducedMotion, reveal, width]);

  const shownStep = Math.min(step, steps.length - 1);
  return (
    <View style={styles.chartBlock}>
      <View
        testID="ride-effort-chart"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Your heart rate during the ride"
        accessibilityHint="Swipe up or down to go through the phases."
        accessibilityValue={{ text: steps[shownStep] ?? "" }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") setStep((current) => Math.min(steps.length - 1, current + 1));
          if (event.nativeEvent.actionName === "decrement") setStep((current) => Math.max(0, current - 1));
        }}
        onLayout={(event) => setWidth(Math.floor(event.nativeEvent.layout.width))}
        style={styles.plot}
      >
        {layout ? (
          <>
            <Svg width={width} height={PLOT_HEIGHT} style={StyleSheet.absoluteFill}>
              {layout.bands.map((band) =>
                band.tinted ? (
                  <Rect key={`band-${band.phaseIndex}`} x={band.x} y={0} width={band.width} height={PLOT_HEIGHT} fill={BAND_TINT} />
                ) : null
              )}
              {layout.gridlines.map((line) => (
                <Line key={`grid-${line.label}`} x1={0} x2={width} y1={line.y} y2={line.y} stroke={equinaTheme.material.separator} strokeWidth={StyleSheet.hairlineWidth} />
              ))}
              {layout.boundaries.map((x) => (
                <Line
                  key={`edge-${x}`}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={PLOT_HEIGHT}
                  stroke={equinaTheme.material.fieldBorder}
                  strokeWidth={1}
                  strokeDasharray={estimated ? "4 4" : undefined}
                />
              ))}
              {layout.bands.map((band) =>
                band.avg ? (
                  <Line
                    key={`avg-${band.phaseIndex}`}
                    x1={band.x + 2}
                    x2={band.x + band.width - 2}
                    y1={band.avg.y}
                    y2={band.avg.y}
                    stroke={equinaTheme.colors.brass}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                ) : null
              )}
            </Svg>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.reveal,
                { width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }
              ]}
            >
              <Svg width={width} height={PLOT_HEIGHT}>
                <Defs>
                  <LinearGradient id="effortFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={equinaTheme.colors.brass} stopOpacity={0.14} />
                    <Stop offset="1" stopColor={equinaTheme.colors.brass} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                {dense
                  ? layout.areas.map((area, index) => <Path key={`area-${index}`} d={area} fill="url(#effortFill)" />)
                  : null}
                {layout.lines.map((line, index) => (
                  <Path
                    key={`line-${index}`}
                    d={line}
                    stroke={equinaTheme.text.primary}
                    strokeWidth={dense ? 2 : 1}
                    strokeDasharray={dense ? undefined : "3 3"}
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
                {dense
                  ? null
                  : layout.points.map((point, index) => (
                      <Circle key={`point-${index}`} cx={point.x} cy={point.y} r={3} fill={equinaTheme.text.primary} />
                    ))}
                {layout.max ? (
                  <Circle cx={layout.max.x} cy={layout.max.y} r={4} stroke={equinaTheme.colors.brass} strokeWidth={2} fill={equinaTheme.surfaces.raised} />
                ) : null}
              </Svg>
            </Animated.View>
            {layout.gridlines.map((line) => (
              <Text key={`grid-label-${line.label}`} maxFontSizeMultiplier={CHART_TEXT_SCALE} style={[styles.axis, { top: line.y - 16, left: 2 }]}>
                {line.label}
              </Text>
            ))}
            {layout.bands.map((band) =>
              band.avg?.label ? (
                <Text
                  key={`avg-label-${band.phaseIndex}`}
                  maxFontSizeMultiplier={CHART_TEXT_SCALE}
                  style={[styles.avgLabel, { top: Math.max(0, band.avg.y - 17), left: band.x, width: band.width }]}
                >
                  {band.avg.label}
                </Text>
              ) : null
            )}
            {layout.max ? (
              <Text
                maxFontSizeMultiplier={CHART_TEXT_SCALE}
                style={[styles.maxLabel, { top: Math.max(0, layout.max.y - 22), left: Math.min(width - 32, Math.max(0, layout.max.x + 6)) }]}
              >
                {layout.max.label}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.timeAxis}>
        <Text maxFontSizeMultiplier={CHART_TEXT_SCALE} style={styles.axisText}>0</Text>
        <Text maxFontSizeMultiplier={CHART_TEXT_SCALE} style={styles.axisText}>{layout?.endLabel ?? ""}</Text>
      </View>

      {layout && layout.bands.length ? (
        <View style={styles.ribbon}>
          {layout.bands.map((band, order) => {
            const phase = effort.phases.find((each) => each.phaseIndex === band.phaseIndex);
            const minutes = Math.max(1, Math.round((phase?.riddenMs ?? 0) / 60_000));
            return (
              <View
                key={`segment-${band.phaseIndex}`}
                accessible
                accessibilityLabel={`${band.name}, ${minutes} ${minutes === 1 ? "minute" : "minutes"}${phase?.avgBpm != null ? `, average ${phase.avgBpm} beats per minute` : ", no reading"}`}
                style={[styles.segment, { left: band.x + 1, width: Math.max(2, band.width - 2) }]}
              >
                <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={styles.segmentText}>
                  {fits ? band.name : String(order + 1)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {layout && !fits ? (
        <View style={styles.byPhase} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={styles.sectionLabel}>By phase</Text>
          {layout.bands.map((band, order) => {
            const phase = effort.phases.find((each) => each.phaseIndex === band.phaseIndex);
            const minutes = Math.max(1, Math.round((phase?.riddenMs ?? 0) / 60_000));
            return (
              <Text key={`by-phase-${band.phaseIndex}`} style={styles.meta}>
                {`${order + 1} ${effortPhaseName(entry.phases?.[band.phaseIndex], band.phaseIndex)} · ${minutes} min · ${phase?.avgBpm != null ? `${phase.avgBpm} bpm` : "—"}`}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const BAND_TINT = "rgba(247,243,234,0.03)";

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
  header: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.sm,
    marginVertical: -equinaTheme.spacing.sm
  },
  sectionLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  chip: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass,
    borderWidth: 1,
    borderColor: "rgba(196,160,90,0.55)",
    borderRadius: equinaTheme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
    overflow: "hidden",
    flexShrink: 1
  },
  privacy: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginVertical: -equinaTheme.spacing.sm
  },
  privacyText: {
    flexShrink: 1
  },
  manage: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    justifyContent: "center",
    paddingRight: equinaTheme.spacing.sm
  },
  manageText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  title: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  rowTitle: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "600"
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
  readingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm,
    minHeight: equinaTheme.accessibility.minimumTapTarget
  },
  textButton: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingRight: equinaTheme.spacing.md
  },
  textButtonLabel: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  stats: {
    flexDirection: "row",
    gap: equinaTheme.spacing.sm
  },
  statsStacked: {
    flexDirection: "column",
    gap: equinaTheme.spacing.xs
  },
  stat: {
    flex: 1,
    minWidth: 0
  },
  statStacked: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: equinaTheme.spacing.sm
  },
  statValue: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  chartBlock: {
    gap: equinaTheme.spacing.xs
  },
  plot: {
    height: PLOT_HEIGHT,
    width: "100%"
  },
  reveal: {
    position: "absolute",
    top: 0,
    left: 0,
    height: PLOT_HEIGHT,
    overflow: "hidden"
  },
  axis: {
    position: "absolute",
    ...equinaTheme.typography.label,
    fontWeight: "400",
    color: equinaTheme.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  avgLabel: {
    position: "absolute",
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass,
    textAlign: "center",
    fontVariant: ["tabular-nums"]
  },
  maxLabel: {
    position: "absolute",
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass,
    fontVariant: ["tabular-nums"]
  },
  timeAxis: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  axisText: {
    ...equinaTheme.typography.label,
    fontWeight: "400",
    color: equinaTheme.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  ribbon: {
    height: 24,
    width: "100%"
  },
  segment: {
    position: "absolute",
    top: 0,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: equinaTheme.material.fieldBorder,
    backgroundColor: equinaTheme.material.quiet,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    overflow: "hidden"
  },
  segmentText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.primary
  },
  byPhase: {
    gap: 2
  }
});
