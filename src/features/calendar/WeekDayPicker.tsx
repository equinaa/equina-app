import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { dayHeading, firstLoggableDay, logStateOn, weekOf } from "../../domain/activity-calendar";
import { addMonths, fullDayLabel, monthGrid, monthLabel, monthOf } from "../../domain/calendar-month";
import { addDays } from "../../domain/training-streak";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";

const weekdayShort = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
// Seven days share the width: larger text sizes grow them only so far.
const DAY_TEXT_SCALE = 1.25;

/**
 * When an activity happened, picked from a week: the week of the day chosen
 * (in the calendar, or today), with arrows to the weeks around it. The
 * calendar button opens the whole month instead, for a day further off. Only
 * the days an activity can be added for are pickable: today and the 29 before.
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
  const [month, setMonth] = useState(monthOf(shown));
  const [wholeMonth, setWholeMonth] = useState(false);
  // A day picked from outside (the sheet opening on another day) brings its week and month.
  useEffect(() => {
    setMonday(weekOf(shown)[0] ?? shown);
    setMonth(monthOf(shown));
  }, [shown]);

  const oldest = firstLoggableDay(today);
  const canGoBack = wholeMonth ? month > monthOf(oldest) : addDays(monday, -1) >= oldest;
  const canGoForward = wholeMonth ? month < monthOf(today) : addDays(monday, 7) <= today;

  const move = (by: number) => {
    selectionHaptic();
    if (wholeMonth) setMonth((current) => addMonths(current, by));
    else setMonday((current) => addDays(current, by * 7));
  };

  const toggleMonth = () => {
    selectionHaptic();
    // Each opens on the day picked.
    setMonday(weekOf(shown)[0] ?? shown);
    setMonth(monthOf(shown));
    setWholeMonth((current) => !current);
  };

  const cell = (day: string, index: number) => {
    const selected = day === value;
    const isToday = day === today;
    const open = logStateOn(day, today) === "open";
    return (
      <Pressable
        key={day}
        testID={`${testID}-day-${wholeMonth ? day : index}`}
        accessibilityRole="radio"
        accessibilityLabel={`${fullDayLabel(day)}${isToday ? ", today" : ""}`}
        accessibilityState={{ selected, disabled: !open }}
        disabled={!open}
        onPress={() => {
          if (!selected) selectionHaptic();
          onChange(day);
          // A day picked from the month goes back to its week.
          if (wholeMonth) setWholeMonth(false);
        }}
        style={({ pressed }) => [styles.day, pressed && styles.pressed]}
      >
        {wholeMonth ? null : (
          <Text maxFontSizeMultiplier={DAY_TEXT_SCALE} style={[styles.weekday, !open && styles.textOff]}>
            {weekdayShort[index]}
          </Text>
        )}
        <View style={[styles.date, !open && styles.dateOff, isToday && styles.dateToday, selected && styles.dateSelected]}>
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
  };

  return (
    <View style={styles.picker} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.heading} testID={`${testID}-picked`}>
          {shown === today ? `Today · ${dayHeading(shown)}` : dayHeading(shown)}
        </Text>
        <View style={styles.arrows}>
          <MotionPressable
            testID={`${testID}-month`}
            accessibilityRole="button"
            accessibilityLabel={wholeMonth ? "Show the week" : "Show the whole month"}
            accessibilityState={{ expanded: wholeMonth }}
            hitSlop={6}
            onPress={toggleMonth}
            style={[styles.arrow, wholeMonth && styles.arrowOn]}
          >
            <CalendarDays size={17} color={wholeMonth ? equinaTheme.colors.ink : equinaTheme.colors.brass} />
          </MotionPressable>
          <MotionPressable
            testID={`${testID}-previous`}
            accessibilityRole="button"
            accessibilityLabel={wholeMonth ? "Previous month" : "Previous week"}
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
            accessibilityLabel={wholeMonth ? "Next month" : "Next week"}
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
      {wholeMonth ? (
        <View accessibilityRole="radiogroup" testID={`${testID}-month-grid`}>
          <Text style={styles.monthTitle}>{monthLabel(month)}</Text>
          <View style={styles.days}>
            {weekdayShort.map((letter) => (
              <Text key={letter} maxFontSizeMultiplier={DAY_TEXT_SCALE} style={[styles.weekday, styles.monthLetter]}>
                {letter}
              </Text>
            ))}
          </View>
          {monthGrid(month).map((row, rowIndex) => (
            <View key={rowIndex} style={[styles.days, styles.monthRow]}>
              {row.map((day, column) => (day ? cell(day, column) : <View key={`empty-${column}`} style={styles.day} />))}
            </View>
          ))}
        </View>
      ) : (
        <View accessibilityRole="radiogroup" style={styles.days}>
          {weekOf(monday).map((day, index) => cell(day, index))}
        </View>
      )}
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
  arrowOn: {
    backgroundColor: equinaTheme.colors.brass,
    borderColor: equinaTheme.colors.brass
  },
  monthTitle: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    textAlign: "center",
    marginBottom: equinaTheme.spacing.xs
  },
  monthLetter: {
    flex: 1,
    textAlign: "center"
  },
  monthRow: {
    marginTop: 4
  },
  dateOff: {
    borderColor: "transparent"
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
