import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RidePeriod, RideSummary } from "../../domain/ride-stats";
import { describeMood, describeTracked, describeTrend } from "../../domain/ride-stats";
import { equinaTheme } from "../../ui/theme/theme";

const periods: ReadonlyArray<{ key: RidePeriod; label: string }> = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" }
];

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export type RideSummaryCardProps = {
  summary: RideSummary | null;
  period: RidePeriod;
  onPeriodChange: (period: RidePeriod) => void;
  /** Rides in the journal overall, used only to word the empty state. */
  lifetimeRides: number;
  lastRideOn?: string;
};

export function RideSummaryCard({
  summary,
  period,
  onPeriodChange,
  lifetimeRides,
  lastRideOn
}: RideSummaryCardProps) {
  const label = period === "week" ? "this week" : "this month";

  // Every line below is omitted rather than defaulted when its fact is
  // missing. A period with no check-ins shows no feeling; a timer that never
  // ran shows no time. Nothing here fills a gap with an assumption.
  const trend = summary ? describeTrend(summary) : null;
  const mood = summary ? describeMood(summary) : null;
  const tracked = summary ? describeTracked(summary.trackedSeconds) : null;

  return (
    <View style={styles.card}>
      <View style={styles.topline}>
        <Text style={styles.title}>Ride journal</Text>
        <View style={styles.toggle}>
          {periods.map((entry) => {
            const active = entry.key === period;
            return (
              <Pressable
                key={entry.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Summarise by ${entry.label.toLowerCase()}`}
                onPress={() => onPeriodChange(entry.key)}
                style={[styles.toggleOption, active && styles.toggleOptionActive]}
              >
                <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{entry.label}</Text>
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
          <View style={styles.headline}>
            <Text style={styles.count}>{summary.rides}</Text>
            <View style={styles.headlineCopy}>
              <Text style={styles.countLabel}>{summary.rides === 1 ? "ride" : "rides"} {label}</Text>
              <Text style={styles.days}>
                {summary.daysRidden === 1 ? "on 1 day" : `across ${summary.daysRidden} days`}
              </Text>
            </View>
          </View>

          {trend ? <Text style={styles.trend}>{trend}</Text> : null}

          <View style={styles.facts}>
            {summary.disciplines.length > 0 ? (
              <Text style={styles.fact} numberOfLines={1}>
                {summary.disciplines.map((entry) => `${titleCase(entry.value)} ${entry.rides}`).join(" · ")}
              </Text>
            ) : null}
            {mood ? <Text style={styles.fact}>{mood}</Text> : null}
            {tracked ? <Text style={styles.fact}>{tracked}</Text> : null}
          </View>

          {summary.focuses.length > 0 ? (
            <Text style={styles.focus} numberOfLines={2}>
              Worked on {summary.focuses.slice(0, 3).join(", ").toLowerCase()}
            </Text>
          ) : null}
        </View>
      )}
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
  topline: { flexDirection: "row", alignItems: "center", gap: equinaTheme.spacing.sm },
  title: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600", flex: 1 },
  toggle: {
    flexDirection: "row",
    backgroundColor: equinaTheme.material.quiet,
    borderRadius: equinaTheme.radius.control,
    padding: 2
  },
  toggleOption: {
    // The theme sets 44 as the minimum tap target and this has to honour it.
    // At 30 the pill looked right and was genuinely hard to hit -- found by
    // failing to press it twice on a real simulator, not by reading the code.
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    justifyContent: "center",
    paddingHorizontal: equinaTheme.spacing.md,
    borderRadius: equinaTheme.radius.compact
  },
  toggleOptionActive: { backgroundColor: equinaTheme.material.selected },
  toggleLabel: { ...equinaTheme.typography.label, color: equinaTheme.text.tertiary },
  toggleLabelActive: { color: equinaTheme.colorRole.accent },
  body: { gap: equinaTheme.spacing.sm },
  headline: { flexDirection: "row", alignItems: "baseline", gap: equinaTheme.spacing.sm },
  count: {
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  headlineCopy: { flex: 1 },
  countLabel: { ...equinaTheme.typography.body, color: equinaTheme.text.primary },
  days: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  trend: { ...equinaTheme.typography.meta, color: equinaTheme.colorRole.accent, fontWeight: "600" },
  facts: { gap: 3 },
  fact: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  focus: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  empty: { gap: equinaTheme.spacing.xs },
  emptyTitle: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  emptyBody: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary }
});
