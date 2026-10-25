import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Flame, Moon } from "lucide-react-native";
import type { StreakSummary, WeekDay } from "../../domain/training-streak";
import { equinaTheme } from "../../ui/theme/theme";
import { plannedRidesLabel } from "../ride/planned-rides";
import { StreakFlame } from "./StreakFlame";

const letters = ["M", "T", "W", "T", "F", "S", "S"] as const;
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const weekStateWords = {
  ridden: "trained",
  missed: "planned, missed",
  planned: "planned",
  off: "horse off",
  rest: "rest day"
} as const;
const stateWords = weekStateWords;

/** Monday to Sunday: a flame on a day trained, an outline on one still planned, a dot on a rest day. */
export function WeekRow({ week, size = "compact" }: { week: readonly WeekDay[]; size?: "compact" | "large" }) {
  const large = size === "large";
  const mark = large ? 40 : 32;
  return (
    <View style={styles.week} accessibilityRole="summary">
      {week.map((day) => (
        <View
          key={day.day}
          accessible
          accessibilityLabel={`${dayNames[day.weekday - 1]}${day.isToday ? ", today" : ""}: ${stateWords[day.state]}`}
          style={styles.weekDay}
        >
          <Text style={[styles.weekLetter, day.isToday && styles.weekLetterToday]}>{letters[day.weekday - 1]}</Text>
          <View
            style={[
              styles.weekMark,
              { width: mark, height: mark, borderRadius: mark / 2 },
              day.state === "ridden" && styles.weekMarkRidden,
              day.state === "planned" && styles.weekMarkPlanned,
              day.state === "missed" && styles.weekMarkMissed
            ]}
          >
            {day.state === "rest" ? (
              <View style={styles.restDot} />
            ) : day.state === "off" ? (
              <Moon size={large ? 18 : 14} color={equinaTheme.text.tertiary} />
            ) : day.state === "ridden" ? (
              <StreakFlame size={large ? 20 : 15} />
            ) : (
              <Flame
                size={large ? 20 : 16}
                strokeWidth={2}
                color={day.state === "planned" ? equinaTheme.text.secondary : equinaTheme.text.tertiary}
              />
            )}
          </View>
          {day.isToday ? <View style={styles.todayTick} /> : <View style={styles.todayTickSpace} />}
        </View>
      ))}
    </View>
  );
}

/** Home's card: the streak and this week, or the way to plan one. */
export function TrainingWeekCard({
  streak,
  horseNames,
  onOpen,
  onPlan
}: {
  streak: StreakSummary;
  horseNames: Record<string, string>;
  onOpen: () => void;
  onPlan: () => void;
}) {
  if (!streak.hasPlan) {
    return (
      <Pressable
        testID="training-week-plan"
        accessibilityRole="button"
        accessibilityLabel="Plan your training week"
        onPress={onPlan}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.topline}>
          <View style={styles.flameBadge}>
            <Flame size={18} color={equinaTheme.colors.brass} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>Plan your training week</Text>
            <Text style={styles.body}>
              Pick the days you ride, with the horse and the training for each. Your streak counts them, and rest days never break it.
            </Text>
          </View>
          <ChevronRight size={17} color={equinaTheme.text.tertiary} />
        </View>
      </Pressable>
    );
  }

  const today = streak.todayPlanned.length ? plannedRidesLabel(streak.todayPlanned, horseNames) : null;
  const todayLine = streak.todayRidden
    ? "Today's training is in the journal."
    : today
      ? `Today: ${today}`
      : "Rest day. Nothing to keep today.";

  return (
    <Pressable
      testID="training-week"
      accessibilityRole="button"
      accessibilityLabel={`${streak.current} day training streak. ${todayLine}`}
      accessibilityHint="Opens your streak and training plan"
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topline}>
        <StreakFlame size={22} muted={streak.current === 0} />
        <Text style={styles.count}>{streak.current}</Text>
        <Text style={styles.countLabel}>{streak.current === 1 ? "training day\nin a row" : "training days\nin a row"}</Text>
        <View style={styles.best}>
          <Text style={styles.bestLabel}>Best</Text>
          <Text style={styles.bestValue}>{streak.best}</Text>
        </View>
      </View>
      <WeekRow week={streak.week} />
      <Text numberOfLines={1} style={styles.today}>{todayLine}</Text>
    </Pressable>
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
  pressed: { opacity: 0.85 },
  topline: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  flameBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(196,160,90,0.55)",
    alignItems: "center",
    justifyContent: "center"
  },
  copy: { flex: 1, gap: 2 },
  title: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  body: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  count: {
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  countLabel: {
    ...equinaTheme.typography.meta,
    flex: 1,
    color: equinaTheme.text.secondary
  },
  best: { alignItems: "flex-end" },
  bestLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.tertiary,
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  bestValue: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  today: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  week: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  weekDay: {
    flex: 1,
    alignItems: "center",
    gap: 6
  },
  weekLetter: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.tertiary
  },
  weekLetterToday: { color: equinaTheme.text.primary },
  weekMark: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quiet
  },
  weekMarkRidden: { backgroundColor: "rgba(196,160,90,0.18)" },
  weekMarkPlanned: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(247,243,234,0.36)"
  },
  weekMarkMissed: { opacity: 0.55 },
  restDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: equinaTheme.text.tertiary
  },
  todayTick: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: equinaTheme.colors.brass
  },
  todayTickSpace: { height: 4 }
});
