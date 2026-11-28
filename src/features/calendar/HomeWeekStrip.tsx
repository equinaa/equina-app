import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { dayHeading, weekOf } from "../../domain/activity-calendar";
import { equinaTheme } from "../../ui/theme/theme";

// Seven days share the width: larger text sizes grow these only so far, so
// two-digit dates still fit their circle.
const DAY_TEXT_SCALE = 1.25;
const weekdayShort = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

/**
 * This week on Home, Monday to Sunday with their dates: today ringed in
 * brass, a dot under each day with an activity done and a ring under each
 * day with one scheduled. A day opens the
 * calendar on it, where its activities are and one can be added.
 */
export function HomeWeekStrip({
  today,
  activityDays,
  plannedDays,
  onOpenDay
}: {
  /** The local day, YYYY-MM-DD. */
  today: string;
  /** The days, YYYY-MM-DD, with at least one activity. */
  activityDays: ReadonlySet<string>;
  /** The days, YYYY-MM-DD, with an activity scheduled and not answered yet. */
  plannedDays: ReadonlySet<string>;
  /** The calendar on a day; today from the Calendar link. */
  onOpenDay: (day: string) => void;
}) {
  const week = weekOf(today);
  return (
    <View style={styles.strip} testID="home-week">
      <View style={styles.header}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} style={styles.title}>Your week</Text>
        <Pressable
          testID="home-week-calendar"
          accessibilityRole="button"
          accessibilityLabel="Open the calendar"
          hitSlop={10}
          onPress={() => onOpenDay(today)}
          style={({ pressed }) => [styles.calendarLink, pressed && styles.pressed]}
        >
          <CalendarDays size={15} strokeWidth={2} color={equinaTheme.colors.brass} />
          <Text maxFontSizeMultiplier={1.4} style={styles.calendarLinkText}>Calendar</Text>
        </Pressable>
      </View>
      <View style={styles.days}>
        {week.map((day, index) => {
          const isToday = day === today;
          const active = activityDays.has(day);
          const scheduled = plannedDays.has(day);
          const ahead = day > today;
          return (
            <Pressable
              key={day}
              testID={`home-week-day-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`${dayHeading(day)}${isToday ? ", today" : ""}${active ? ", has activities" : ""}${scheduled ? ", activity scheduled" : ""}`}
              onPress={() => onOpenDay(day)}
              style={({ pressed }) => [styles.day, pressed && styles.pressed]}
            >
              <Text maxFontSizeMultiplier={DAY_TEXT_SCALE} style={[styles.weekday, isToday && styles.weekdayToday]}>{weekdayShort[index]}</Text>
              <View style={[styles.date, isToday && styles.dateToday]}>
                <Text maxFontSizeMultiplier={DAY_TEXT_SCALE} style={[styles.dateText, ahead && styles.dateTextAhead, isToday && styles.dateTextToday]}>
                  {Number(day.slice(8, 10))}
                </Text>
              </View>
              <View style={[styles.dot, active ? styles.dotOn : scheduled && styles.dotScheduled]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    // Home's column already has its side margins and the gap between cards.
    gap: equinaTheme.spacing.xs
  },
  header: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  title: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    letterSpacing: 0.6
  },
  calendarLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 28
  },
  calendarLinkText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  days: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  day: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    minHeight: 44
  },
  weekday: {
    ...equinaTheme.typography.meta,
    fontSize: 12,
    lineHeight: 16,
    color: equinaTheme.text.tertiary
  },
  weekdayToday: {
    color: equinaTheme.colors.brass,
    fontWeight: "700"
  },
  date: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent"
  },
  dateToday: {
    borderColor: equinaTheme.colors.brass,
    backgroundColor: "rgba(196,160,90,0.12)"
  },
  dateText: {
    // No fixed line height: a larger text size would push the number off the circle's centre.
    fontSize: 16,
    fontWeight: "600",
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  dateTextAhead: {
    color: equinaTheme.text.secondary,
    fontWeight: "500"
  },
  dateTextToday: {
    color: equinaTheme.colors.brass,
    fontWeight: "700"
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "transparent"
  },
  dotOn: {
    backgroundColor: equinaTheme.colors.brass
  },
  dotScheduled: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: equinaTheme.colors.brass
  },
  pressed: {
    opacity: 0.6
  }
});
