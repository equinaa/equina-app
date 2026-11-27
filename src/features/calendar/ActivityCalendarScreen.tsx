import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { CalendarClock, ChevronLeft, ChevronRight, PencilLine, Timer } from "lucide-react-native";
import type { EquinaBackend, PlannedActivity, RideEntry } from "../../backend";
import { activitiesByDay, dayHeading, dayUseOn, lastSchedulableDay, logStateOn, shortWeekdayDate } from "../../domain/activity-calendar";
import { addMonths, fullDayLabel, monthGrid, monthLabel, monthOf, weekdayInitials } from "../../domain/calendar-month";
import { disciplineLabel } from "../../domain/labels";
import { EquinaButton } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { formatActivityTime, rideTrainingLabel } from "../ride/ride-plan";
import { plannedStart } from "./planned-schedule";
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

const plannedMinutesOf = (activity: PlannedActivity) =>
  Math.round(activity.phases.reduce((sum, phase) => sum + phase.plannedSeconds, 0) / 60);

/**
 * The rider's activities month by month. A day with one done has a dot, a day
 * with one scheduled a ring. A day picked shows both underneath: what was
 * done, and what was scheduled, to mark done or let go once its time has
 * come. Add activity logs a day of the last month or schedules one up to
 * three months ahead.
 */
export function ActivityCalendarScreen({
  visible,
  today,
  initialDay,
  backend,
  enabled,
  journal,
  journalSince,
  journalLoading,
  journalError,
  onRetryJournal,
  horseNames,
  canAdd,
  planned,
  plannedError,
  onRetryPlanned,
  onAddActivity,
  onMarkDone,
  onSkip,
  onRemove,
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
  journalLoading: boolean;
  journalError: string;
  onRetryJournal: () => void;
  horseNames: Record<string, string>;
  /** False while a ride is running or the journal cannot save. */
  canAdd: boolean;
  /** The scheduled activities, from a month back on. */
  planned: readonly PlannedActivity[];
  plannedError: string;
  onRetryPlanned: () => void;
  onAddActivity: (day: string) => void;
  /** Logs a scheduled activity whose time has come, as it was planned. */
  onMarkDone: (activity: PlannedActivity) => Promise<void>;
  onSkip: (activity: PlannedActivity) => Promise<void>;
  onRemove: (activity: PlannedActivity) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(initialDay);
  const [month, setMonth] = useState(monthOf(initialDay));
  // The scheduled activity being answered or removed, and what went wrong with it.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [plannedProblem, setPlannedProblem] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelected(initialDay);
    setMonth(monthOf(initialDay));
  }, [visible, initialDay]);

  const activities = useMonthActivities({
    backend,
    enabled: enabled && visible,
    month,
    journal,
    journalSince,
    journalLoading,
    journalError,
    onRetryJournal
  });
  const byDay = activitiesByDay(activities.entries);
  const latestMonth = monthOf(lastSchedulableDay(today));
  const selectedActivities = byDay.get(selected) ?? [];
  const selectedUse = dayUseOn(selected, today);
  const grid = monthGrid(month);
  // A scheduled activity marked done shows as the journal entry it became
  // (and not at all once that entry is deleted).
  const plannedOn = (day: string) => planned.filter((item) => item.day === day && item.status !== "done");
  const selectedPlanned = plannedOn(selected);

  const goToMonth = (by: number) => {
    const next = addMonths(month, by);
    if (next > latestMonth) return;
    selectionHaptic();
    setMonth(next);
    // The pick follows into the month: today there, else its first day.
    setSelected(next === monthOf(today) ? today : `${next}-01`);
  };

  const act = async (activity: PlannedActivity, action: (item: PlannedActivity) => Promise<void>) => {
    if (busyId) return;
    selectionHaptic();
    setBusyId(activity.id);
    setPlannedProblem(null);
    try {
      await action(activity);
    } catch (error) {
      setPlannedProblem({ id: activity.id, message: error instanceof Error && error.message ? error.message : "That did not work. Try again." });
    } finally {
      setBusyId(null);
    }
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
                      const scheduled = plannedOn(day).filter((item) => item.status === "planned").length;
                      const ahead = day > today;
                      return (
                        <Pressable
                          key={day}
                          testID={`activity-calendar-day-${day}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${fullDayLabel(day)}${isToday ? ", today" : ""}${count ? `, ${count} ${count === 1 ? "activity" : "activities"}` : ""}${scheduled ? `, ${scheduled} scheduled` : ""}`}
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
                          <View style={[styles.dot, count > 0 ? styles.dotOn : scheduled > 0 && styles.dotScheduled]} />
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              {activities.loading ? (
                <ActivityIndicator color={equinaTheme.colors.brass} style={styles.loading} />
              ) : activities.error || plannedError ? (
                <Pressable
                  testID="activity-calendar-retry"
                  accessibilityRole="button"
                  onPress={() => {
                    if (activities.error) void activities.retry();
                    if (plannedError) onRetryPlanned();
                  }}
                  style={styles.retry}
                >
                  <Text style={styles.error}>{activities.error || plannedError} Tap to try again.</Text>
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
              ) : null}

              {selectedPlanned.length > 0 ? (
                <View style={styles.list}>
                  {selectedPlanned.map((item) => {
                    const horse = item.horseId ? horseNames[item.horseId] : undefined;
                    const training = rideTrainingLabel(item.trainingType) ?? item.trainingType;
                    const minutes = plannedMinutesOf(item);
                    const ended = plannedStart(item).getTime() + minutes * 60_000 <= Date.now();
                    const answerable = item.status === "planned" && ended;
                    const loggable = logStateOn(item.day, today) === "open";
                    const busy = busyId === item.id;
                    return (
                      <View key={item.id} style={[styles.row, styles.plannedRow]} testID={`activity-calendar-planned-${item.id}`}>
                        <View style={styles.plannedTop}>
                          <View style={[styles.rowIcon, styles.plannedIcon]}>
                            <CalendarClock size={16} strokeWidth={2} color={equinaTheme.colors.brass} />
                          </View>
                          <View
                            style={styles.rowCopy}
                            accessible
                            accessibilityLabel={`Scheduled: ${training}, ${formatActivityTime(item.startMinutes)}, ${minutes} min${horse ? `, ${horse}` : ""}${item.status === "skipped" ? ", did not happen" : ""}`}
                          >
                            <Text numberOfLines={1} style={[styles.rowTitle, item.status === "skipped" && styles.rowTitleSkipped]}>{training}</Text>
                            <Text numberOfLines={1} style={styles.rowMeta}>
                              {[formatActivityTime(item.startMinutes), `${minutes} min`, horse].filter(Boolean).join(" · ")}
                            </Text>
                            <Text style={styles.plannedState}>
                              {item.status === "skipped"
                                ? "Didn't happen"
                                : answerable
                                  ? loggable ? "Did it happen?" : "Too long ago to log"
                                  : "Scheduled"}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.plannedActions}>
                          {answerable && loggable ? (
                            <EquinaButton
                              testID={`activity-calendar-done-${item.id}`}
                              label={busy ? "Saving..." : "Done"}
                              disabled={busy}
                              showArrow={false}
                              style={styles.plannedAction}
                              onPress={() => void act(item, onMarkDone)}
                            />
                          ) : null}
                          {answerable ? (
                            <EquinaButton
                              testID={`activity-calendar-skip-${item.id}`}
                              label="Didn't happen"
                              variant="secondary"
                              disabled={busy}
                              showArrow={false}
                              style={styles.plannedAction}
                              onPress={() => void act(item, onSkip)}
                            />
                          ) : (
                            <EquinaButton
                              testID={`activity-calendar-remove-${item.id}`}
                              label={busy ? "Removing..." : "Remove"}
                              variant="secondary"
                              disabled={busy}
                              showArrow={false}
                              style={styles.plannedAction}
                              onPress={() => void act(item, onRemove)}
                            />
                          )}
                        </View>
                        {plannedProblem?.id === item.id ? (
                          <Text accessibilityRole="alert" style={styles.error}>{plannedProblem.message}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {selectedActivities.length === 0 && selectedPlanned.length === 0 && !activities.loading ? (
                <Text style={styles.empty}>
                  {selected > today ? "Nothing scheduled yet." : "Nothing logged on this day."}
                </Text>
              ) : null}

              {(selectedUse === "log" || selectedUse === "schedule") && canAdd ? (
                <EquinaButton
                  testID="activity-calendar-add"
                  label={
                    selected === today
                      ? "Add activity today"
                      : selectedUse === "schedule"
                        ? `Schedule on ${shortWeekdayDate(selected)}`
                        : `Add activity on ${shortWeekdayDate(selected)}`
                  }
                  onPress={() => onAddActivity(selected)}
                />
              ) : selectedUse === "tooOld" ? (
                <Text style={styles.note}>Activities can be added up to a month back.</Text>
              ) : selectedUse === "tooFar" ? (
                <Text style={styles.note}>Activities can be scheduled up to three months ahead.</Text>
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
  dotScheduled: {
    borderWidth: 1.5,
    borderColor: equinaTheme.colors.brass,
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  plannedRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: equinaTheme.spacing.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(196,160,90,0.45)",
    backgroundColor: "transparent"
  },
  plannedTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  plannedIcon: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "rgba(196,160,90,0.6)"
  },
  plannedState: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass
  },
  rowTitleSkipped: {
    color: equinaTheme.text.tertiary,
    textDecorationLine: "line-through"
  },
  plannedActions: {
    flexDirection: "row",
    gap: equinaTheme.spacing.sm
  },
  plannedAction: {
    flex: 1
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
