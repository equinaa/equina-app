import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { dayHeading, firstLoggableDay, logStateOn, weekOf } from "../../domain/activity-calendar";
import { fullDayLabel } from "../../domain/calendar-month";
import { addDays } from "../../domain/training-streak";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";

const weekdayShort = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
// Seven days share the width: larger text sizes grow them only so far.
const DAY_TEXT_SCALE = 1.25;

/**
 * When an activity happened, picked from a week: the week of the day chosen
 * (in the calendar, or today), with arrows to the weeks around it. Only the
 * days an activity can be added for are pickable: today and the 30 before.
 */
export function WeekDayPicker({
  value,
  today,
  onChange,
  testID = "add-activity-week"
}: {
  /** The day picked, YYYY-MM-DD. */
  value: string;
  /** The local day, YYYY-MM-DD. */
  today: string;
  onChange: (day: string) => void;
  testID?: string;
}) {
  // The sheet sets its day as it opens; until then (an empty day) the week is today's.
  const shown = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
  const [monday, setMonday] = useState(weekOf(shown)[0] ?? shown);
  // A day picked from outside (the sheet opening on another day) brings its week.
  useEffect(() => {
    setMonday(weekOf(shown)[0] ?? shown);
  }, [shown]);

  const week = weekOf(monday);
  const oldest = firstLoggableDay(today);
  const canGoBack = addDays(monday, -1) >= oldest;
  const canGoForward = addDays(monday, 7) <= today;

  const move = (by: number) => {
    selectionHaptic();
    setMonday((current) => addDays(current, by * 7));
  };

  return (
    <View style={styles.picker} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.heading} testID={`${testID}-picked`}>
          {shown === today ? `Today · ${dayHeading(shown)}` : dayHeading(shown)}
        </Text>
        <View style={styles.arrows}>
          <MotionPressable
            testID={`${testID}-previous`}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            accessibilityState={{ disabled: !canGoBack }}
            disabled={!canGoBack}
            hitSlop={6}
            onPress={() => move(-1)}
            style={[styles.arrow, !canGoBack && styles.arrowOff]}
          >
            <ChevronLeft size={18} color={equinaTheme.text.primary} />
          </MotionPressable>
          <MotionPressable
            testID={`${testID}-next`}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            accessibilityState={{ disabled: !canGoForward }}
            disabled={!canGoForward}
            hitSlop={6}
            onPress={() => move(1)}
            style={[styles.arrow, !canGoForward && styles.arrowOff]}
          >
            <ChevronRight size={18} color={equinaTheme.text.primary} />
          </MotionPressable>
        </View>
      </View>
      <View accessibilityRole="radiogroup" style={styles.days}>
        {week.map((day, index) => {
          const selected = day === value;
          const isToday = day === today;
          const open = logStateOn(day, today) === "open";
          return (
            <Pressable
              key={day}
              testID={`${testID}-day-${index}`}
              accessibilityRole="radio"
              accessibilityLabel={`${fullDayLabel(day)}${isToday ? ", today" : ""}`}
              accessibilityState={{ selected, disabled: !open }}
              disabled={!open}
              onPress={() => {
                if (!selected) selectionHaptic();
                onChange(day);
              }}
              style={({ pressed }) => [styles.day, pressed && styles.pressed]}
            >
              <Text maxFontSizeMultiplier={DAY_TEXT_SCALE} style={[styles.weekday, !open && styles.textOff]}>
                {weekdayShort[index]}
              </Text>
              <View style={[styles.date, isToday && styles.dateToday, selected && styles.dateSelected]}>
                <Text
                  maxFontSizeMultiplier={DAY_TEXT_SCALE}
                  style={[
                    styles.dateText,
                    !open && styles.textOff,
                    isToday && styles.dateTextToday,
                    selected && styles.dateTextSelected
                  ]}
                >
                  {Number(day.slice(8, 10))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {
    gap: equinaTheme.spacing.sm
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.sm
  },
  heading: {
    ...equinaTheme.typography.body,
    fontWeight: "600",
    color: equinaTheme.text.primary,
    flexShrink: 1
  },
  arrows: {
    flexDirection: "row",
    gap: equinaTheme.spacing.sm
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: equinaTheme.material.separator
  },
  arrowOff: {
    opacity: 0.3
  },
  days: {
    flexDirection: "row"
  },
  day: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    minHeight: 44
  },
  weekday: {
    ...equinaTheme.typography.meta,
    fontSize: 12,
    color: equinaTheme.text.tertiary
  },
  date: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: equinaTheme.material.separator
  },
  dateToday: {
    borderColor: equinaTheme.colors.brass
  },
  dateSelected: {
    backgroundColor: equinaTheme.colors.brass,
    borderColor: equinaTheme.colors.brass
  },
  dateText: {
    fontSize: 16,
    fontWeight: "600",
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  dateTextToday: {
    color: equinaTheme.colors.brass,
    fontWeight: "700"
  },
  dateTextSelected: {
    color: equinaTheme.colors.ink,
    fontWeight: "700"
  },
  textOff: {
    color: equinaTheme.text.tertiary,
    opacity: 0.5
  },
  pressed: {
    opacity: 0.6
  }
});
