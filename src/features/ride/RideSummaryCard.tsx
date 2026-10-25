import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { RidePeriod, RideSummary } from "../../domain/ride-stats";
import { describeLogged, describeMood, describeTracked, describeTrend } from "../../domain/ride-stats";
import { equinaTheme } from "../../ui/theme/theme";
import { rideTrainingLabel } from "./ride-plan";

const periods: ReadonlyArray<{ key: RidePeriod; label: string }> = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" }
];

// Each Week/Month option is still a full 44pt target; only the pill drawn
// inside it is smaller. Not hitSlop: react-native-web's Pressable ignores it.
const TAP_TARGET = equinaTheme.accessibility.minimumTapTarget;
const TRACK_HEIGHT = 32;
const TRACK_INSET = (TAP_TARGET - TRACK_HEIGHT) / 2;
const CHIP_HEIGHT = TRACK_HEIGHT - 4;

// The facts sit in a narrow column, so a line may only break between them:
// "Pole work 4" and "Cross-country 1" stay whole and no line starts with the dot.
const NBSP = "\u00A0";
const keepWords = (text: string) => text.replace(/ /g, NBSP).replace(/-/g, "\u2011");
// The last word never wraps alone, and "4 of 6" stays one count.
const keepTail = (text: string) =>
  text.replace(/(\d+) of (\d+)/g, `$1${NBSP}of${NBSP}$2`).replace(/ (\S+)$/, `${NBSP}$1`);
const TALLY_GAP = `${NBSP}· `;
// From the accessibility text sizes up, the 120pt column cannot hold a
// two-digit count or a glued phrase, and iOS would split them mid-word: the
// facts go under the count and wrap at any space, as the card used to.
const STACK_ABOVE_FONT_SCALE = 1.4;
const asIs = (text: string) => text;

export type RideSummaryCardProps = {
  summary: RideSummary | null;
  period: RidePeriod;
  onPeriodChange: (period: RidePeriod) => void;
  /** Rides in the journal overall, used only to word the empty state. */
  lifetimeRides: number;
  lastRideOn?: string;
  /** Opens every ride, one line each. */
  onOpenJournal?: () => void;
};

export function RideSummaryCard({
  summary,
  period,
  onPeriodChange,
  lifetimeRides,
  lastRideOn,
  onOpenJournal
}: RideSummaryCardProps) {
  const label = period === "week" ? "this week" : "this month";
  const stacked = useWindowDimensions().fontScale > STACK_ABOVE_FONT_SCALE;
  const words = stacked ? asIs : keepWords;
  const tail = stacked ? asIs : keepTail;

  // Every line below is omitted rather than defaulted when its fact is
  // missing. A period with no check-ins shows no feeling; a timer that never
  // ran shows no time. Nothing here fills a gap with an assumption.
  const trend = summary ? describeTrend(summary) : null;
  const mood = summary ? describeMood(summary) : null;
  const tracked = summary ? describeTracked(summary.trackedSeconds) : null;
  const logged = summary ? describeLogged(summary.loggedSeconds) : null;
  // A ride set up as "Flatwork" also has "Flatwork" as its focus; the tally
  // above already says it, so only older, freer focuses are repeated here.
  const trainingWords = new Set(summary?.trainings.map((entry) => (rideTrainingLabel(entry.value) ?? entry.value).toLowerCase()) ?? []);
  const workedOn = summary?.focuses.filter((focus) => !trainingWords.has(focus.toLowerCase())) ?? [];
  const rideWord = summary?.rides === 1 ? "ride" : "rides";
  const daysText = summary?.daysRidden === 1 ? "on 1 day" : `across ${summary?.daysRidden ?? 0} days`;
  const hasFacts = Boolean(summary && (summary.trainings.length > 0 || mood || tracked || logged));

  return (
    <View style={styles.card}>
      <View style={[styles.topline, stacked && styles.toplineStacked]}>
        <Text style={[styles.title, stacked && styles.titleStacked]}>Ride journal</Text>
        <View accessibilityRole="radiogroup" style={styles.toggle}>
          <View pointerEvents="none" style={styles.toggleTrack} />
          {periods.map((entry) => {
            const active = entry.key === period;
            return (
              <Pressable
                key={entry.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Summarise by ${entry.label.toLowerCase()}`}
                onPress={() => onPeriodChange(entry.key)}
                style={styles.toggleOption}
              >
                <View style={[styles.toggleChip, active && styles.toggleChipActive]}>
                  <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{entry.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!summary || summary.rides === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No rides {label}</Text>
          <Text style={styles.emptyBody}>
            {lifetimeRides > 0 && lastRideOn
              ? `Your last ride was ${lastRideOn}. Log one and it appears here.`
              : "Log a ride and this fills in on its own."}
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          {/* The count on the left, what made it up on the right: the facts
              fill the width instead of stacking short lines down one side. */}
          <View style={[styles.split, stacked && styles.splitStacked]}>
            <View
              accessible
              accessibilityLabel={[`${summary.rides} ${rideWord} ${label}`, daysText, trend].filter(Boolean).join(", ")}
              style={stacked ? undefined : hasFacts ? styles.headline : styles.headlineAlone}
            >
              <Text style={styles.count}>{summary.rides}</Text>
              <Text style={styles.countLabel}>{rideWord} {label}</Text>
              <Text style={styles.days}>{daysText}</Text>
              {trend ? <Text style={styles.trend}>{tail(trend)}</Text> : null}
            </View>

            {hasFacts ? (
              <View style={[styles.facts, !stacked && styles.factsBeside]}>
                {summary.trainings.length > 0 ? (
                  <Text style={styles.fact}>
                    {summary.trainings.map((entry, index) => (
                      <Text key={entry.value}>
                        {index > 0 ? TALLY_GAP : ""}
                        {words(rideTrainingLabel(entry.value) ?? entry.value)}{stacked ? " " : NBSP}
                        <Text style={styles.factCount}>{entry.rides}</Text>
                      </Text>
                    ))}
                  </Text>
                ) : null}
                {mood ? <Text style={styles.fact}>{tail(mood)}</Text> : null}
                {tracked ? <Text style={styles.fact}>{tail(tracked)}</Text> : null}
                {logged ? <Text style={styles.fact}>{tail(logged)}</Text> : null}
              </View>
            ) : null}
          </View>

          {workedOn.length > 0 ? (
            <Text style={styles.focus} numberOfLines={2}>
              Worked on {workedOn.slice(0, 3).join(", ").toLowerCase()}
            </Text>
          ) : null}
        </View>
      )}

      {onOpenJournal && lifetimeRides > 0 ? (
        <Pressable
          testID="ride-journal-open"
          accessibilityRole="button"
          accessibilityLabel="See all rides"
          onPress={onOpenJournal}
          style={({ pressed }) => [styles.open, pressed && styles.openPressed]}
        >
          <Text style={styles.openText}>See all rides</Text>
          <ChevronRight size={17} color={equinaTheme.colorRole.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: equinaTheme.surfaces.raised,
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    padding: equinaTheme.spacing.md,
    gap: equinaTheme.spacing.compact
  },
  topline: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm,
    // The targets reach TRACK_INSET above and below the drawn pill; pulling
    // the row in by as much keeps the pill on the card's padding.
    marginVertical: -TRACK_INSET
  },
  toplineStacked: { flexDirection: "column", alignItems: "flex-start", gap: 0 },
  title: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600", flex: 1 },
  titleStacked: { flex: 0 },
  toggle: { flexDirection: "row" },
  toggleTrack: {
    ...StyleSheet.absoluteFillObject,
    top: TRACK_INSET,
    bottom: TRACK_INSET,
    backgroundColor: equinaTheme.material.quiet,
    borderRadius: equinaTheme.radius.compact + 2
  },
  toggleOption: {
    // The theme sets 44 as the minimum tap target and this has to honour it.
    // At 30 the pill looked right and was genuinely hard to hit -- found by
    // failing to press it twice on a real simulator, not by reading the code.
    // The pill is drawn smaller inside; the target stays TAP_TARGET.
    minHeight: TAP_TARGET,
    minWidth: TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  toggleChip: {
    minHeight: CHIP_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.compact
  },
  toggleChipActive: { backgroundColor: equinaTheme.material.selected },
  toggleLabel: { ...equinaTheme.typography.label, color: equinaTheme.text.tertiary },
  toggleLabelActive: { color: equinaTheme.colorRole.accent },
  body: { gap: equinaTheme.spacing.compact },
  split: { flexDirection: "row", alignItems: "stretch" },
  splitStacked: { flexDirection: "column", gap: equinaTheme.spacing.sm },
  // A fixed width, so the rule does not move when Week and Month change the label.
  headline: { width: 120, paddingRight: equinaTheme.spacing.compact },
  headlineAlone: { flex: 1 },
  count: {
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  countLabel: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  days: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  trend: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colorRole.accent,
    fontWeight: "600",
    marginTop: equinaTheme.spacing.xs
  },
  facts: { gap: equinaTheme.spacing.xs },
  factsBeside: {
    flex: 1,
    justifyContent: "center",
    paddingLeft: equinaTheme.spacing.compact,
    borderLeftWidth: 1,
    borderLeftColor: equinaTheme.material.separator
  },
  fact: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  factCount: { color: equinaTheme.text.primary, fontWeight: "600", fontVariant: ["tabular-nums"] },
  focus: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  empty: { gap: equinaTheme.spacing.xs },
  emptyTitle: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  emptyBody: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  // A full-width row under a hairline, chevron at the edge, like the other
  // rows on Home -- the card ends on a line instead of a gap.
  open: {
    minHeight: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: equinaTheme.material.separator,
    marginBottom: -equinaTheme.spacing.sm
  },
  openPressed: { opacity: 0.6 },
  openText: { ...equinaTheme.typography.meta, color: equinaTheme.colorRole.accent, fontWeight: "600" }
});
