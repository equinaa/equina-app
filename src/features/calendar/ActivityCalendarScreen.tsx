import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, PencilLine, Timer } from "lucide-react-native";
import type { EquinaBackend, RideEntry } from "../../backend";
import { activitiesByDay, dayHeading, logStateOn, shortWeekdayDate } from "../../domain/activity-calendar";
import { addMonths, fullDayLabel, monthGrid, monthLabel, monthOf, weekdayInitials } from "../../domain/calendar-month";
import { disciplineLabel } from "../../domain/labels";
import { EquinaButton } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { formatActivityTime, rideTrainingLabel } from "../ride/ride-plan";
import { rideMinutesLabel } from "../ride/ride-review-prompt";
import { useMonthActivities } from "./useMonthActivities";

// Seven days share the width: larger text sizes grow the grid only so far,
// so two-digit dates still fit their circle.
const DAY_TEXT_SCALE = 1.25;

const trainingOf = (entry: RideEntry) => rideTrainingLabel(entry.trainingType) ?? disciplineLabel(entry.discipline);

const startTimeOf = (entry: RideEntry) => {
  const started = new Date(entry.startedAt);
  return formatActivityTime(started.getHours() * 60 + started.getMinutes());
};

/**
 * The rider's activities month by month. Every day with one has a dot; a day
 * picked shows its activities underneath, and Add activity for it when it is
 * within the last month (how far back the server takes one). Days still
 * ahead can be looked at, not logged.
 */
export function ActivityCalendarScreen({
  visible,
  today,
  initialDay,
  backend,
  enabled,
  journal,
  journalSince,
  horseNames,
  canAdd,
  onAddActivity,
  onClose
}: {
  visible: boolean;
  /** The local day, YYYY-MM-DD. */
  today: string;
  /** The day the calendar opens on. */
  initialDay: string;
  backend: EquinaBackend | null;
  enabled: boolean;
  /** The journal's rides, every one since `journalSince`. */
  journal: readonly RideEntry[];
  journalSince: Date;
  horseNames: Record<string, string>;
  /** False while a ride is running or the journal cannot save. */
  canAdd: boolean;
  onAddActivity: (day: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(initialDay);
  const [month, setMonth] = useState(monthOf(initialDay));

  useEffect(() => {
    if (!visible) return;
    setSelected(initialDay);
    setMonth(monthOf(initialDay));
  }, [visible, initialDay]);

  const activities = useMonthActivities({ backend, enabled: enabled && visible, month, journal, journalSince });
  const byDay = activitiesByDay(activities.entries);
  const latestMonth = monthOf(today);
  const selectedActivities = byDay.get(selected) ?? [];
  const selectedState = logStateOn(selected, today);
  const grid = monthGrid(month);

  const goToMonth = (by: number) => {
    const next = addMonths(month, by);
    if (next > latestMonth) return;
    selectionHaptic();
    setMonth(next);
    // The pick follows into the month: today there, else its first day.
    setSelected(next === latestMonth ? today : `${next}-01`);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* A Modal is outside the app's provider, so it measures its own safe area. */}
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]} testID="activity-calendar">
          <View style={styles.header}>
            <MotionPressable
              testID="activity-calendar-close"
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={onClose}
              style={styles.headerButton}
            >
              <ChevronLeft size={26} color={equinaTheme.text.primary} />
            </MotionPressable>
            <Text accessibilityRole="header" style={styles.headerTitle}>CALENDAR</Text>
            <View style={styles.headerButton} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.monthCard}>
              <View style={styles.monthRow}>
                <MotionPressable
                  testID="activity-calendar-previous"
                  accessibilityRole="button"
                  accessibilityLabel={`Previous month, ${monthLabel(addMonths(month, -1))}`}
                  hitSlop={8}
                  onPress={() => goToMonth(-1)}
                  style={styles.monthButton}
                >
                  <ChevronLeft size={20} color={equinaTheme.text.primary} />
                </MotionPressable>
                <Text style={styles.monthTitle} testID="activity-calendar-month">{monthLabel(month)}</Text>
                <MotionPressable
                  testID="activity-calendar-next"
                  accessibilityRole="button"
                  accessibilityLabel={`Next month, ${monthLabel(addMonths(month, 1))}`}
                  accessibilityState={{ disabled: month >= latestMonth }}
                  disabled={month >= latestMonth}
                  hitSlop={8}
                  onPress={() => goToMonth(1)}
                  style={[styles.monthButton, month >= latestMonth && styles.monthButtonOff]}
                >
                  <ChevronRight size={20} color={equinaTheme.text.primary} />
                </MotionPressable>
              </View>

              <View style={styles.weekRow}>
                {weekdayInitials.map((letter, index) => (
                  <Text key={index} maxFontSizeMultiplier={DAY_TEXT_SCALE} style={styles.weekLetter}>{letter}</Text>
                ))}
              </View>

              <View accessibilityRole="list">
                {grid.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.weekRow}>
                    {row.map((day, column) => {
                      if (!day) return <View key={`empty-${column}`} style={styles.cell} />;
                      const isSelected = day === selected;
                      const isToday = day === today;
                      const count = byDay.get(day)?.length ?? 0;
                      const ahead = day > today;
                      return (
                        <Pressable
                          key={day}
                          testID={`activity-calendar-day-${day}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${fullDayLabel(day)}${isToday ? ", today" : ""}${count ? `, ${count} ${count === 1 ? "activity" : "activities"}` : ""}`}
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => {
                            if (!isSelected) selectionHaptic();
                            setSelected(day);
                          }}
                          style={styles.cell}
                        >
                          <View style={[styles.date, isToday && styles.dateToday, isSelected && styles.dateSelected]}>
                            <Text
                              maxFontSizeMultiplier={DAY_TEXT_SCALE}
                              style={[
                                styles.dateText,
                                ahead && styles.dateTextAhead,
                                isToday && styles.dateTextToday,
                                isSelected && styles.dateTextSelected
                              ]}
                            >
                              {Number(day.slice(8, 10))}
                            </Text>
                          </View>
                          <View style={[styles.dot, count > 0 && styles.dotOn]} />
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              {activities.loading ? (
                <ActivityIndicator color={equinaTheme.colors.brass} style={styles.loading} />
              ) : activities.error ? (
                <Pressable
                  testID="activity-calendar-retry"
                  accessibilityRole="button"
                  onPress={() => void activities.retry()}
                  style={styles.retry}
                >
                  <Text style={styles.error}>{activities.error} Tap to try again.</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Text accessibilityRole="header" style={styles.dayTitle} testID="activity-calendar-selected">
                  {dayHeading(selected)}
                </Text>
                {selected === today ? <Text style={styles.todayTag}>Today</Text> : null}
              </View>

              {selectedActivities.length > 0 ? (
                <View style={styles.list}>
                  {selectedActivities.map((entry) => {
                    const horse = entry.horseId ? horseNames[entry.horseId] : undefined;
                    const manual = entry.source === "manual";
                    return (
                      <View
                        key={entry.id}
                        accessible
                        accessibilityLabel={`${trainingOf(entry)}, ${startTimeOf(entry)}, ${rideMinutesLabel(entry.elapsedSeconds)}${horse ? `, ${horse}` : ""}${manual ? ", logged" : ""}`}
                        style={styles.row}
                      >
                        <View style={styles.rowIcon}>
                          {manual ? (
                            <PencilLine size={16} strokeWidth={2} color={equinaTheme.colors.brass} />
                          ) : (
                            <Timer size={16} strokeWidth={2} color={equinaTheme.colors.brass} />
                          )}
                        </View>
                        <View style={styles.rowCopy}>
                          <Text numberOfLines={1} style={styles.rowTitle}>{trainingOf(entry)}</Text>
                          <Text numberOfLines={1} style={styles.rowMeta}>
                            {[startTimeOf(entry), rideMinutesLabel(entry.elapsedSeconds), horse].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : activities.loading ? null : (
                <Text style={styles.empty}>
                  {selectedState === "future" ? "This day is still ahead." : "Nothing logged on this day."}
                </Text>
              )}

              {selectedState === "open" && canAdd ? (
                <EquinaButton
                  testID="activity-calendar-add"
                  label={selected === today ? "Add activity today" : `Add activity on ${shortWeekdayDate(selected)}`}
                  onPress={() => onAddActivity(selected)}
                />
              ) : selectedState === "tooOld" ? (
                <Text style={styles.note}>Activities can be added up to a month back.</Text>
              ) : null}
            </View>
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
  headerTitle: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.primary,
    letterSpacing: 1.2
  },
  content: {
    paddingHorizontal: equinaTheme.spacing.md,
    paddingBottom: equinaTheme.spacing.xl,
    gap: equinaTheme.spacing.lg
  },
  monthCard: {
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.raised,
    paddingHorizontal: equinaTheme.spacing.sm,
    paddingVertical: equinaTheme.spacing.md,
    gap: 2
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: equinaTheme.spacing.xs,
    marginBottom: equinaTheme.spacing.sm
  },
  monthButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: equinaTheme.material.separator
  },
  monthButtonOff: {
    opacity: 0.3
  },
  monthTitle: {
    ...equinaTheme.typography.body,
    fontWeight: "700",
    color: equinaTheme.text.primary
  },
  weekRow: {
    flexDirection: "row"
  },
  weekLetter: {
    flex: 1,
    textAlign: "center",
    ...equinaTheme.typography.meta,
    fontSize: 12,
    color: equinaTheme.text.tertiary,
    paddingBottom: 4
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 3,
    gap: 3,
    minHeight: 50
  },
  date: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent"
  },
  dateToday: {
    borderColor: equinaTheme.colors.brass
  },
  dateSelected: {
    backgroundColor: equinaTheme.colors.brass,
    borderColor: equinaTheme.colors.brass
  },
  dateText: {
    // No fixed line height: a larger text size would push the number off the circle's centre.
    fontSize: 16,
    fontWeight: "500",
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  dateTextAhead: {
    color: equinaTheme.text.tertiary
  },
  dateTextToday: {
    color: equinaTheme.colors.brass,
    fontWeight: "700"
  },
  dateTextSelected: {
    color: equinaTheme.colors.ink,
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
  loading: {
    marginTop: equinaTheme.spacing.sm
  },
  retry: {
    marginTop: equinaTheme.spacing.sm,
    paddingHorizontal: equinaTheme.spacing.sm
  },
  error: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    textAlign: "center"
  },
  daySection: {
    gap: equinaTheme.spacing.md
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  dayTitle: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary,
    flexShrink: 1
  },
  todayTag: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  list: {
    gap: equinaTheme.spacing.sm
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.raised,
    paddingHorizontal: equinaTheme.spacing.md,
    paddingVertical: equinaTheme.spacing.compact
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(196,160,90,0.12)"
  },
  rowCopy: {
    flex: 1,
    gap: 2
  },
  rowTitle: {
    ...equinaTheme.typography.body,
    fontWeight: "600",
    color: equinaTheme.text.primary
  },
  rowMeta: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  empty: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary
  },
  note: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  }
});
