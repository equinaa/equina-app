import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Moon, Plus, X } from "lucide-react-native";
import type { HorseTimeOff, TrainingPlanDay } from "../../backend";
import { addDays, isoWeekday, timeOffOn } from "../../domain/training-streak";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { rideTrainingLabel } from "../ride/ride-plan";
import { currentTimeOff, timeOffAction, timeOffLabel, timeOffRange } from "./time-off";

const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const fullDayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Short enough for a seventh of a phone: "Dres", "XC", "Lunge". */
const shortTraining: Record<string, string> = {
  dressage: "Dres",
  jumping: "Jump",
  flatwork: "Flat",
  "pole-work": "Poles",
  "cross-country": "XC",
  hack: "Hack",
  hunting: "Hunt",
  lunging: "Lunge",
  groundwork: "Ground"
};
const shortLabel = (trainingType: string) =>
  shortTraining[trainingType] ?? (rideTrainingLabel(trainingType) ?? "Ride").slice(0, 5);

/**
 * A horse's training program: this week from the rider's plan, day by day --
 * the training it has, rest, or time off -- and its time off to come.
 */
export function TrainingProgram({
  horseId,
  horseName,
  planDays,
  timeOff,
  today,
  failed,
  loading,
  canEditPlan,
  canEditTimeOff,
  onEditPlan,
  onAddTimeOff,
  onEndTimeOff,
  onRemoveTimeOff,
  onRetry
}: {
  horseId: string;
  horseName: string;
  /** The rider's plan in force today, every horse. */
  planDays: readonly TrainingPlanDay[];
  timeOff: readonly HorseTimeOff[];
  today: string;
  /** The plan could not be read: offer to try again rather than show an empty week. */
  failed: boolean;
  /** Still being read: nothing to edit yet, or a save would start from an empty week. */
  loading: boolean;
  /** The rider's own horse: a shared horse is not in the rider's plan. */
  canEditPlan: boolean;
  canEditTimeOff: boolean;
  onEditPlan: () => void;
  onAddTimeOff: () => void;
  onEndTimeOff: (id: string) => Promise<void>;
  onRemoveTimeOff: (id: string) => Promise<void>;
  onRetry: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<{ id: string; message: string } | null>(null);

  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TRAINING PROGRAM</Text>
        <View style={styles.card}>
          <Text style={styles.summary}>Loading {horseName}'s week...</Text>
        </View>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TRAINING PROGRAM</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryTitle}>The training program could not load</Text>
          <Text style={styles.retryBody}>Tap to try again</Text>
        </Pressable>
      </View>
    );
  }

  const monday = addDays(today, 1 - isoWeekday(today));
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    const entry = planDays.find((planned) => planned.weekday === index + 1 && planned.horseId === horseId);
    const off = timeOffOn(timeOff, horseId, day);
    return { day, index, entry, off, isToday: day === today };
  });
  const rides = week.filter((day) => day.entry && !day.off).length;
  const upcoming = currentTimeOff(timeOff, horseId, today);

  const act = (id: string, action: "remove" | "end") => {
    setRemoving(id);
    setRemoveError(null);
    void (action === "end" ? onEndTimeOff(id) : onRemoveTimeOff(id)).then(
      () => setConfirming(null),
      (failure: unknown) => setRemoveError({ id, message: failure instanceof Error && failure.message ? failure.message : "The time off could not be changed." })
    ).finally(() => setRemoving(null));
  };

  return (
    <View style={styles.section} testID="training-program">
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>TRAINING PROGRAM</Text>
        {canEditPlan ? (
          <Pressable
            testID="training-program-edit"
            accessibilityRole="button"
            accessibilityLabel={`Edit ${horseName}'s training days`}
            hitSlop={8}
            onPress={onEditPlan}
          >
            <Text style={styles.action}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Tappable for sighted riders; screen readers read each day, and edit
          through the Edit link above. */}
      <Pressable
        accessible={false}
        disabled={!canEditPlan}
        onPress={onEditPlan}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.week}>
          {week.map(({ day, index, entry, off, isToday }) => (
            <View
              key={day}
              accessible
              accessibilityLabel={`${fullDayNames[index]}${isToday ? ", today" : ""}: ${off ? timeOffLabel(off.kind) : entry ? rideTrainingLabel(entry.trainingType) : "rest"}`}
              style={styles.weekDay}
            >
              <Text style={[styles.weekName, isToday && styles.weekNameToday]}>{dayNames[index]}</Text>
              <View
                style={[
                  styles.cell,
                  entry && !off && styles.cellRide,
                  off && styles.cellOff,
                  isToday && styles.cellToday
                ]}
              >
                {off ? (
                  <Moon size={15} color={equinaTheme.text.secondary} />
                ) : (
                  <Text numberOfLines={1} style={[styles.cellText, entry && styles.cellTextRide]}>
                    {entry ? shortLabel(entry.trainingType) : "Rest"}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.summary}>
          {planDays.length === 0
            ? `No training week yet. Plan the days you ride ${horseName}.`
            : rides === 0
              ? `${horseName} has no rides planned this week.`
              : `${rides === 1 ? "1 ride" : `${rides} rides`} planned this week${week.some((entry) => entry.entry && entry.off) ? ", not counting days off" : ""}.`}
        </Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.subLabel}>Time off</Text>
      </View>
      {upcoming.length === 0 ? (
        <Text style={styles.empty}>Rest, a break, stall rest, an injury or vet treatment. Planned rides those days are not due.</Text>
      ) : (
        <View style={styles.list}>
          {upcoming.map((period) => {
            const asking = confirming === period.id;
            const action = timeOffAction(period, today);
            const onNow = period.startsOn <= today && period.endsOn >= today;
            return (
              <View key={period.id} style={styles.period} testID={`time-off-${period.id}`}>
                <View style={styles.periodTop}>
                  <Moon size={16} color={equinaTheme.colors.brass} />
                  <View style={styles.periodCopy}>
                    <Text style={styles.periodTitle}>
                      {timeOffLabel(period.kind)}{onNow ? " · now" : ""}
                    </Text>
                    <Text style={styles.periodMeta}>{timeOffRange(period)}</Text>
                    {period.note ? <Text numberOfLines={2} style={styles.periodNote}>{period.note}</Text> : null}
                  </View>
                  {canEditTimeOff && action === "remove" && !asking ? (
                    <MotionPressable
                      testID={`time-off-remove-${period.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${timeOffLabel(period.kind)}, ${timeOffRange(period)}`}
                      hitSlop={6}
                      onPress={() => {
                        selectionHaptic();
                        setRemoveError(null);
                        setConfirming(period.id);
                      }}
                      style={styles.iconButton}
                    >
                      <X size={16} color={equinaTheme.text.secondary} />
                    </MotionPressable>
                  ) : null}
                  {canEditTimeOff && action === "end" && !asking ? (
                    <MotionPressable
                      testID={`time-off-end-${period.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${horseName} is back in work: end ${timeOffLabel(period.kind)} early`}
                      onPress={() => {
                        selectionHaptic();
                        setRemoveError(null);
                        setConfirming(period.id);
                      }}
                      style={styles.endButton}
                    >
                      <Text style={styles.endText}>Back in work</Text>
                    </MotionPressable>
                  ) : null}
                </View>
                {asking ? (
                  <View style={styles.confirm}>
                    <Text style={styles.confirmText}>
                      {action === "end"
                        ? `End it yesterday? From today ${horseName}'s planned rides are due again; the days it covered stay covered.`
                        : "Take this time off back? Planned rides those days are due again."}
                    </Text>
                    {removeError?.id === period.id ? <Text accessibilityRole="alert" style={styles.error}>{removeError.message}</Text> : null}
                    <View style={styles.confirmActions}>
                      <MotionPressable
                        accessibilityRole="button"
                        accessibilityLabel="Keep it"
                        disabled={removing === period.id}
                        onPress={() => setConfirming(null)}
                        style={styles.confirmButton}
                      >
                        <Text style={styles.keepText}>Keep</Text>
                      </MotionPressable>
                      <MotionPressable
                        testID={`time-off-confirm-${period.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={action === "end" ? "End time off" : "Remove time off"}
                        disabled={removing === period.id}
                        onPress={() => act(period.id, action === "end" ? "end" : "remove")}
                        style={[styles.confirmButton, styles.removeButton]}
                      >
                        <Text style={styles.removeText}>
                          {removing === period.id ? "Saving..." : action === "end" ? "End it" : "Remove"}
                        </Text>
                      </MotionPressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      {canEditTimeOff ? (
        <MotionPressable
          testID="time-off-add"
          accessibilityRole="button"
          accessibilityLabel={`Add time off for ${horseName}`}
          onPress={() => {
            selectionHaptic();
            onAddTimeOff();
          }}
          style={styles.add}
        >
          <Plus size={16} color={equinaTheme.colors.brass} />
          <Text style={styles.addText}>Add time off</Text>
        </MotionPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: equinaTheme.spacing.compact },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.primary,
    letterSpacing: 0.8
  },
  subLabel: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  action: { ...equinaTheme.typography.meta, color: equinaTheme.colors.brass, fontWeight: "600" },
  card: {
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    padding: equinaTheme.spacing.compact,
    gap: equinaTheme.spacing.compact
  },
  pressed: { opacity: 0.85 },
  week: { flexDirection: "row", gap: 4 },
  weekDay: { flex: 1, alignItems: "center", gap: 6 },
  weekName: {
    ...equinaTheme.typography.label,
    fontSize: 10,
    color: equinaTheme.text.tertiary,
    letterSpacing: 0.4
  },
  weekNameToday: { color: equinaTheme.text.primary },
  cell: {
    alignSelf: "stretch",
    height: 40,
    borderRadius: equinaTheme.radius.compact,
    backgroundColor: equinaTheme.material.quiet,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2
  },
  cellRide: { backgroundColor: equinaTheme.material.selected },
  cellOff: { borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(247,243,234,0.28)", backgroundColor: "transparent" },
  cellToday: { borderWidth: 1, borderColor: equinaTheme.colors.brass },
  cellText: { fontSize: 11, lineHeight: 14, fontWeight: "600", color: equinaTheme.text.tertiary },
  cellTextRide: { color: equinaTheme.colors.brass },
  summary: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  empty: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  list: { gap: equinaTheme.spacing.sm },
  period: {
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet,
    padding: equinaTheme.spacing.compact,
    gap: equinaTheme.spacing.sm
  },
  periodTop: { flexDirection: "row", alignItems: "flex-start", gap: equinaTheme.spacing.sm },
  periodCopy: { flex: 1, gap: 1 },
  periodTitle: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  periodMeta: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  periodNote: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  iconButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  endButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: equinaTheme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(196,160,90,0.55)",
    alignItems: "center",
    justifyContent: "center"
  },
  endText: { ...equinaTheme.typography.label, color: equinaTheme.colors.brass },
  confirm: { gap: equinaTheme.spacing.sm },
  confirmText: { ...equinaTheme.typography.meta, color: equinaTheme.text.primary },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: equinaTheme.spacing.sm },
  confirmButton: {
    minHeight: 40,
    paddingHorizontal: equinaTheme.spacing.md,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quietPressed
  },
  removeButton: { backgroundColor: "rgba(214,92,76,0.18)" },
  keepText: { ...equinaTheme.typography.meta, color: equinaTheme.text.primary, fontWeight: "600" },
  removeText: { ...equinaTheme.typography.meta, color: equinaTheme.colorRole.criticalOnDark, fontWeight: "600" },
  error: { ...equinaTheme.typography.meta, color: equinaTheme.colorRole.criticalOnDark },
  retry: {
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised,
    padding: equinaTheme.spacing.md,
    gap: 2
  },
  retryTitle: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  retryBody: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  add: {
    minHeight: 44,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    borderRadius: equinaTheme.radius.control,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(196,160,90,0.55)",
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  addText: { ...equinaTheme.typography.meta, color: equinaTheme.colors.brass, fontWeight: "600" }
});
