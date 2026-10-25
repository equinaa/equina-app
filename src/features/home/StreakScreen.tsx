import { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Info, Moon } from "lucide-react-native";
import { longDayLabel } from "../../domain/local-day";
import type { StreakSummary, WeekDay } from "../../domain/training-streak";
import { EquinaButton } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { equinaTheme } from "../../ui/theme/theme";
import { StreakFlame } from "./StreakFlame";
import { weekStateWords } from "./TrainingWeek";

const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const fullDayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const stateWords = weekStateWords;

/**
 * "2 of 3": the planned days of this week trained so far, not counting days
 * whose horses are all off; rides alone when the week has none planned.
 */
export const weekProgress = (week: readonly WeekDay[]) => {
  const planned = week.filter((day) => day.due.length > 0);
  const ridden = week.filter((day) => day.state === "ridden");
  if (planned.length === 0) return { value: String(ridden.length), label: ridden.length === 1 ? "Ride this week" : "Rides this week" };
  const done = planned.filter((day) => day.state === "ridden").length;
  return { value: `${done} of ${planned.length}`, label: "Planned this week" };
};

/**
 * The streak up close, a screen of its own: the flame and the count, when
 * it started, this week, the best run, and how far the next milestone is.
 * Milestones count training days; the (i) says how the streak is kept.
 */
export function StreakScreen({
  visible,
  streak,
  onEditPlan,
  onClose
}: {
  visible: boolean;
  streak: StreakSummary;
  onEditPlan: () => void;
  onClose: () => void;
}) {
  const [explained, setExplained] = useState(false);
  useEffect(() => {
    if (visible) setExplained(false);
  }, [visible]);

  const span = Math.max(1, streak.nextMilestone - streak.previousMilestone);
  const progress = Math.min(1, Math.max(0, (streak.current - streak.previousMilestone) / span));
  const toGo = streak.nextMilestone - streak.current;
  const thisWeek = weekProgress(streak.week);
  const started = streak.startedOn ? longDayLabel(streak.startedOn) : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* A Modal is outside the app's provider, so it measures its own safe area. */}
      <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]} testID="streak-screen">
        <View style={styles.header}>
          <MotionPressable
            testID="streak-close"
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={onClose}
            style={styles.headerButton}
          >
            <ChevronLeft size={26} color={equinaTheme.text.primary} />
          </MotionPressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>DAY STREAK</Text>
          <MotionPressable
            testID="streak-info"
            accessibilityRole="button"
            accessibilityLabel="How the streak works"
            accessibilityState={{ expanded: explained }}
            hitSlop={8}
            onPress={() => setExplained((value) => !value)}
            style={[styles.headerButton, styles.infoButton, explained && styles.infoButtonOn]}
          >
            <Info size={18} color={equinaTheme.text.primary} />
          </MotionPressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {explained ? (
            <View style={styles.explain}>
              <Text style={styles.explainText}>
                Your streak counts training days in a row, against your training week. A planned day needs a ride or a logged activity. Rest days never break it, and a ride on a day off adds one. A planned day missed starts it over; today counts until it ends.
              </Text>
            </View>
          ) : null}

          <View style={styles.hero}>
            <StreakFlame size={190} glow muted={streak.current === 0} />
            <Text style={styles.count} accessibilityLabel={`${streak.current} day streak`}>{streak.current}</Text>
            <Text style={styles.countLabel}>DAY STREAK</Text>
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{started ?? "Next ride"}</Text>
              <Text style={styles.statLabel}>{started ? "Streak started" : "Starts with your"}</Text>
            </View>
            <View style={styles.statRule} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{thisWeek.value}</Text>
              <Text style={styles.statLabel}>{thisWeek.label}</Text>
            </View>
            <View style={styles.statRule} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{streak.best}</Text>
              <Text style={styles.statLabel}>Max streak</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>THIS WEEK</Text>
            <View style={styles.week}>
              {streak.week.map((day) => (
                <View
                  key={day.day}
                  accessible
                  accessibilityLabel={`${fullDayNames[day.weekday - 1]}${day.isToday ? ", today" : ""}: ${stateWords[day.state]}`}
                  style={styles.weekDay}
                >
                  <Text style={[styles.weekName, day.isToday && styles.weekNameToday]}>{dayNames[day.weekday - 1]}</Text>
                  <View style={styles.weekMark}>
                    {day.state === "ridden" ? (
                      <StreakFlame size={22} />
                    ) : day.state === "missed" ? (
                      <StreakFlame size={22} muted />
                    ) : day.state === "planned" ? (
                      <View style={styles.plannedRing} />
                    ) : day.state === "off" ? (
                      <Moon size={20} color={equinaTheme.text.tertiary} />
                    ) : (
                      <View style={styles.restDot} />
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.card, styles.milestone]}>
            <View style={styles.badge}>
              <View style={[styles.badgeRing, styles.badgeRingLit]}>
                <StreakFlame size={26} muted={streak.previousMilestone === 0} />
              </View>
              <Text style={styles.badgeNumber}>{streak.previousMilestone}</Text>
            </View>
            <View style={styles.milestoneMiddle}>
              <Text style={styles.milestoneToGo}>
                {toGo === 1 ? "1 more day" : `${toGo} more days`}
              </Text>
              <View
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Progress to the next milestone"
                accessibilityValue={{ min: streak.previousMilestone, max: streak.nextMilestone, now: streak.current }}
                style={styles.track}
              >
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.milestoneText}>to unlock your{"\n"}next milestone.</Text>
            </View>
            <View style={styles.badge}>
              <View style={styles.badgeRing}>
                <StreakFlame size={26} muted />
              </View>
              <Text style={[styles.badgeNumber, styles.badgeNumberNext]}>{streak.nextMilestone}</Text>
            </View>
          </View>

          <EquinaButton testID="streak-edit-plan" label="Edit training week" variant="secondary" onPress={onEditPlan} />
        </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.canvas
  },
  header: {
    height: 52,
    paddingHorizontal: equinaTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center"
  },
  infoButton: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(247,243,234,0.6)",
    width: 32,
    height: 32
  },
  infoButtonOn: { borderColor: equinaTheme.colors.brass, backgroundColor: equinaTheme.material.selected },
  headerTitle: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.primary,
    letterSpacing: 1.2
  },
  content: {
    paddingHorizontal: equinaTheme.spacing.md,
    paddingBottom: equinaTheme.spacing.xl,
    gap: equinaTheme.spacing.md
  },
  explain: {
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet,
    padding: equinaTheme.spacing.compact
  },
  explainText: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  hero: {
    alignItems: "center",
    marginTop: -equinaTheme.spacing.sm
  },
  count: {
    marginTop: -equinaTheme.spacing.lg,
    fontSize: 76,
    lineHeight: 84,
    fontWeight: "700",
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  countLabel: {
    ...equinaTheme.typography.label,
    fontSize: 14,
    color: equinaTheme.text.primary,
    letterSpacing: 1.2
  },
  stats: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: equinaTheme.spacing.sm
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4
  },
  statRule: {
    width: 1,
    backgroundColor: equinaTheme.material.separator
  },
  statValue: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "700",
    textAlign: "center",
    fontVariant: ["tabular-nums"]
  },
  statLabel: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    textAlign: "center"
  },
  card: {
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    padding: equinaTheme.spacing.md,
    gap: equinaTheme.spacing.compact
  },
  cardLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.primary,
    letterSpacing: 0.8
  },
  week: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  weekDay: {
    flex: 1,
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  weekName: {
    ...equinaTheme.typography.label,
    fontSize: 11,
    color: equinaTheme.text.tertiary,
    letterSpacing: 0.6
  },
  weekNameToday: { color: equinaTheme.text.primary },
  weekMark: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  plannedRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(247,243,234,0.4)"
  },
  restDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: equinaTheme.text.tertiary
  },
  milestone: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  badge: {
    alignItems: "center",
    gap: 4,
    width: 72
  },
  badgeRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.surfaces.elevated,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeRingLit: { borderColor: equinaTheme.colors.brass },
  badgeNumber: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  badgeNumberNext: { color: equinaTheme.text.secondary },
  milestoneMiddle: {
    flex: 1,
    alignItems: "center",
    gap: 6
  },
  milestoneToGo: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  track: {
    alignSelf: "stretch",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: equinaTheme.material.quietPressed
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: equinaTheme.colors.brass
  },
  milestoneText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    textAlign: "center"
  }
});
