import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  addMonths,
  canPickRangeDay,
  daysInMonth,
  fullDayLabel,
  lastPickableDay,
  monthGrid,
  monthLabel,
  monthOf,
  pickRangeDay,
  rangePosition,
  weekdayInitials,
  type RangeLimits,
  type RangePick
} from "../../domain/calendar-month";
import { shortDayLabel } from "../../domain/local-day";
import { selectionHaptic } from "../motion/haptics";
import { equinaTheme } from "../theme/theme";
import { EquinaIconButton } from "./EquinaPrimitives";

type EquinaDateRangeCalendarProps = RangeLimits & {
  /** First and last day, YYYY-MM-DD; equal for a one-day period. */
  startsOn: string;
  endsOn: string;
  today: string;
  onChange: (startsOn: string, endsOn: string) => void;
  /** Prefix of every testID in here: `${testID}-from`, `${testID}-day-2026-11-24`... */
  testID: string;
  startLabel?: string;
  endLabel?: string;
};

// Every month takes six rows, the most one can need. The calendar sits in a
// sheet anchored to the bottom: a month one row shorter would move the arrows
// from under the finger on the way through the year.
const WEEK_ROWS = 6;
const emptyWeek: (string | null)[] = [null, null, null, null, null, null, null];

const positionWords = {
  single: ", first and last day",
  start: ", first day",
  end: ", last day",
  inside: ", in the period"
} as const;

/**
 * A first and a last day picked from a month grid: the first tap sets the
 * first day, the second the last, and the days between are shaded. Days the
 * limits do not allow cannot be tapped.
 *
 * Plain views, so it is the same on the web and on a phone. It opens on the
 * month of the first day and keeps its own place from there; mount it anew
 * (a key) to start over.
 */
export function EquinaDateRangeCalendar({
  startsOn,
  endsOn,
  today,
  min,
  maxStart,
  maxSpanDays,
  onChange,
  testID,
  startLabel = "From",
  endLabel = "Until"
}: EquinaDateRangeCalendarProps) {
  const [month, setMonth] = useState(() => monthOf(startsOn));
  const [picking, setPicking] = useState<RangePick["picking"]>("start");

  const range: RangePick = { startsOn, endsOn, picking };
  const limits: RangeLimits = { min, maxStart, maxSpanDays };
  const lastDay = lastPickableDay(range, limits);
  const atFirstMonth = min !== undefined && month <= monthOf(min);
  const atLastMonth = lastDay !== null && month >= monthOf(lastDay);

  const weeks = monthGrid(month);
  while (weeks.length < WEEK_ROWS) weeks.push(emptyWeek);
  const lastOfMonth = daysInMonth(month);

  // "12 Nov"; with the year when it is not this one, so a period that runs a
  // full year does not read as the same day twice.
  const dayText = (day: string) => {
    const label = shortDayLabel(day) ?? day;
    return day.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${day.slice(0, 4)}`;
  };

  const turn = (by: number) => {
    selectionHaptic();
    setMonth((current) => addMonths(current, by));
  };

  const pick = (day: string) => {
    const next = pickRangeDay(range, day, limits);
    if (next === range) return;
    selectionHaptic();
    setPicking(next.picking);
    onChange(next.startsOn, next.endsOn);
  };

  return (
    <View testID={`${testID}-calendar`} style={styles.calendar}>
      <View style={styles.chosen}>
        <Text testID={`${testID}-range`} accessibilityLiveRegion="polite" style={styles.summary}>
          <Text testID={`${testID}-from`}>{startLabel} {dayText(startsOn)}</Text>
          {" · "}
          <Text testID={`${testID}-until`}>{endLabel} {dayText(endsOn)}</Text>
        </Text>
        <Text style={styles.prompt}>{picking === "end" ? "Now tap the last day." : "Tap the first day, then the last."}</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.monthRow}>
          <EquinaIconButton
            Icon={ChevronLeft}
            label="Previous month"
            testID={`${testID}-month-previous`}
            disabled={atFirstMonth}
            onPress={() => turn(-1)}
          />
          <Text testID={`${testID}-month`} accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.monthLabel}>
            {monthLabel(month)}
          </Text>
          <EquinaIconButton
            Icon={ChevronRight}
            label="Next month"
            testID={`${testID}-month-next`}
            disabled={atLastMonth}
            onPress={() => turn(1)}
          />
        </View>

        <View>
          {/* The letters are for the eye: each day says its weekday in full. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.week}>
            {weekdayInitials.map((initial, index) => (
              <Text key={index} style={styles.weekday}>{initial}</Text>
            ))}
          </View>
          {weeks.map((week, row) => (
            <View key={row} style={styles.week}>
              {week.map((day, column) => {
                if (!day) return <View key={column} style={styles.cell} />;
                const position = rangePosition(range, day);
                const endpoint = position !== null && position !== "inside";
                const isToday = day === today;
                const disabled = !canPickRangeDay(range, day, limits);
                // Where the shading breaks off without the range ending (the
                // week wraps, the month turns) it is rounded, not cut square.
                const dayOfMonth = Number(day.slice(8, 10));
                const opensRow = column === 0 || dayOfMonth === 1;
                const closesRow = column === 6 || dayOfMonth === lastOfMonth;
                return (
                  <Pressable
                    key={column}
                    testID={`${testID}-day-${day}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${fullDayLabel(day)}${isToday ? ", today" : ""}${position ? positionWords[position] : ""}`}
                    accessibilityState={{ selected: position !== null, disabled }}
                    disabled={disabled}
                    onPress={() => pick(day)}
                    style={styles.cell}
                  >
                    {({ pressed }) => (
                      <>
                        {position && position !== "single" ? (
                          <View
                            pointerEvents="none"
                            style={[
                              styles.band,
                              position === "start" && styles.bandFromMiddle,
                              position === "end" && styles.bandToMiddle,
                              position === "inside" && opensRow && styles.bandOpensRow,
                              position === "inside" && closesRow && styles.bandClosesRow
                            ]}
                          />
                        ) : null}
                        <View
                          style={[
                            styles.mark,
                            isToday && styles.markToday,
                            pressed && styles.markPressed,
                            endpoint && styles.markChosen
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              endpoint && styles.dayTextChosen,
                              // A chosen day stays readable even when it cannot be tapped again.
                              disabled && position === null && styles.dayTextDisabled
                            ]}
                          >
                            {dayOfMonth}
                          </Text>
                        </View>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const CELL = equinaTheme.accessibility.minimumTapTarget;
const MARK = 36;

const styles = StyleSheet.create({
  calendar: { gap: equinaTheme.spacing.sm },
  chosen: { gap: 2 },
  summary: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  prompt: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  // A phone's width at most: in a wide browser window the sheet runs edge to
  // edge, and a week stretched across it is hard to read as one.
  grid: { width: "100%", maxWidth: 400, gap: equinaTheme.spacing.xs },
  monthRow: { flexDirection: "row", alignItems: "center", gap: equinaTheme.spacing.sm },
  monthLabel: {
    flex: 1,
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center"
  },
  week: { flexDirection: "row" },
  weekday: {
    flex: 1,
    ...equinaTheme.typography.label,
    color: equinaTheme.text.tertiary,
    textAlign: "center",
    paddingBottom: equinaTheme.spacing.xs
  },
  cell: { flex: 1, height: CELL, alignItems: "center", justifyContent: "center" },
  // The shading runs edge to edge so it joins from one day to the next; on the
  // first and the last day it starts and stops under the middle of the mark.
  band: {
    position: "absolute",
    top: (CELL - MARK) / 2,
    bottom: (CELL - MARK) / 2,
    left: 0,
    right: 0,
    backgroundColor: equinaTheme.material.selected
  },
  bandFromMiddle: { left: "50%" },
  bandToMiddle: { right: "50%" },
  bandOpensRow: { borderTopLeftRadius: MARK / 2, borderBottomLeftRadius: MARK / 2 },
  bandClosesRow: { borderTopRightRadius: MARK / 2, borderBottomRightRadius: MARK / 2 },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent"
  },
  markToday: { borderColor: equinaTheme.colors.brass },
  markPressed: { backgroundColor: equinaTheme.material.quietPressed },
  markChosen: { borderColor: equinaTheme.colors.brass, backgroundColor: equinaTheme.colors.brass },
  dayText: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ["tabular-nums"]
  },
  dayTextChosen: { color: equinaTheme.colors.ink, fontWeight: "600" },
  dayTextDisabled: { opacity: 0.3 }
});
