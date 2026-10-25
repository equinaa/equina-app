import { useEffect, useState } from "react";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import type { TrainingPlanDay } from "../../backend";
import { EquinaButton, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { rideTrainingLabel, rideTrainingTypes } from "../ride/ride-plan";
import { reminderHour } from "../ride/training-reminders";

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export type PlanHorse = { id: string; name: string };

/**
 * The rider's training week: for each day, ride or rest, and on a riding day
 * the training and the horse. Saved from today on; the weeks before keep the
 * plan they had.
 */
export function TrainingPlanSheet({
  visible,
  days: initialDays,
  reminders: initialReminders,
  horses,
  defaultHorseId,
  defaultTrainingType,
  saving,
  error,
  onSave,
  onDismiss
}: {
  visible: boolean;
  days: readonly TrainingPlanDay[];
  reminders: boolean;
  horses: readonly PlanHorse[];
  /** Home's horse: a new riding day starts with it. */
  defaultHorseId?: string;
  /** The rider's usual training: a new riding day starts with it. */
  defaultTrainingType: string;
  saving: boolean;
  error?: string;
  onSave: (days: TrainingPlanDay[], reminders: boolean) => Promise<void>;
  onDismiss: () => void;
}) {
  const [days, setDays] = useState<TrainingPlanDay[]>([]);
  const [reminders, setReminders] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDays([...initialDays]);
    setReminders(initialReminders);
    setOpen(null);
    // Opening is the reset point; edits while open must survive re-renders.
  }, [visible]);

  const dayOf = (weekday: number) => days.find((day) => day.weekday === weekday);
  const knownHorse = (id?: string) => (id && horses.some((horse) => horse.id === id) ? id : undefined);

  const toggle = (weekday: number) => {
    selectionHaptic();
    if (dayOf(weekday)) {
      setDays((current) => current.filter((day) => day.weekday !== weekday));
      if (open === weekday) setOpen(null);
      return;
    }
    const horseId = knownHorse(defaultHorseId) ?? horses[0]?.id;
    setDays((current) => [
      ...current,
      { weekday, trainingType: defaultTrainingType, ...(horseId ? { horseId } : {}) }
    ]);
    setOpen(weekday);
  };

  const change = (weekday: number, patch: Partial<TrainingPlanDay>) =>
    setDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));

  const horseName = (id?: string) => horses.find((horse) => horse.id === id)?.name;

  return (
    <EquinaSheet
      visible={visible}
      title="Training week"
      onDismiss={saving ? () => undefined : onDismiss}
      closeTestID="training-plan-close"
    >
      <View style={styles.body} testID="training-plan">
        <Text style={styles.intro}>The days you plan to ride, and what each one is for. Your streak counts them.</Text>

        <View style={styles.days}>
          {dayNames.map((name, index) => {
            const weekday = index + 1;
            const day = dayOf(weekday);
            const expanded = open === weekday && Boolean(day);
            const summary = day
              ? [rideTrainingLabel(day.trainingType), horseName(day.horseId)].filter(Boolean).join(" · ")
              : "Rest";
            return (
              <View key={name} style={[styles.day, day && styles.dayOn]}>
                <View style={styles.dayTop}>
                  <MotionPressable
                    testID={`training-plan-day-${weekday}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}: ${summary}`}
                    accessibilityHint={day ? "Shows the training and horse for this day" : undefined}
                    disabled={!day}
                    onPress={() => {
                      selectionHaptic();
                      setOpen(expanded ? null : weekday);
                    }}
                    style={styles.dayCopy}
                  >
                    <Text style={styles.dayName}>{name}</Text>
                    <Text numberOfLines={1} style={[styles.daySummary, !day && styles.dayRest]}>{summary}</Text>
                  </MotionPressable>
                  {day ? (
                    expanded
                      ? <ChevronUp size={18} color={equinaTheme.text.secondary} />
                      : <ChevronDown size={18} color={equinaTheme.text.secondary} />
                  ) : null}
                  <Switch
                    testID={`training-plan-toggle-${weekday}`}
                    accessibilityLabel={`Ride on ${name}`}
                    value={Boolean(day)}
                    onValueChange={() => toggle(weekday)}
                    trackColor={{ false: equinaTheme.surfaces.elevated, true: equinaTheme.colorRole.positive }}
                    thumbColor={equinaTheme.colors.ivory}
                    ios_backgroundColor={equinaTheme.surfaces.elevated}
                  />
                </View>

                {expanded && day ? (
                  <View style={styles.dayEdit}>
                    <Text style={styles.label}>Training</Text>
                    <View accessibilityRole="radiogroup" style={styles.chips}>
                      {rideTrainingTypes.map((type) => {
                        const selected = type.id === day.trainingType;
                        return (
                          <MotionPressable
                            key={type.id}
                            testID={`training-plan-${weekday}-${type.id}`}
                            accessibilityRole="radio"
                            accessibilityLabel={type.label}
                            accessibilityState={{ selected }}
                            pressedScale={0.97}
                            onPress={() => {
                              if (!selected) selectionHaptic();
                              change(weekday, { trainingType: type.id });
                            }}
                            style={[styles.chip, selected && styles.chipSelected]}
                          >
                            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{type.label}</Text>
                          </MotionPressable>
                        );
                      })}
                    </View>
                    {horses.length > 0 ? (
                      <>
                        <Text style={styles.label}>Horse</Text>
                        <View accessibilityRole="radiogroup" style={styles.chips}>
                          {horses.map((horse) => {
                            const selected = horse.id === day.horseId;
                            return (
                              <MotionPressable
                                key={horse.id}
                                testID={`training-plan-${weekday}-horse-${horse.id}`}
                                accessibilityRole="radio"
                                accessibilityLabel={horse.name}
                                accessibilityState={{ selected }}
                                pressedScale={0.97}
                                onPress={() => {
                                  if (!selected) selectionHaptic();
                                  change(weekday, { horseId: horse.id });
                                }}
                                style={[styles.chip, selected && styles.chipSelected]}
                              >
                                <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>{horse.name}</Text>
                              </MotionPressable>
                            );
                          })}
                        </View>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.reminders}>
          <View style={styles.remindersCopy}>
            <Text style={styles.remindersTitle}>Morning reminders</Text>
            <Text style={styles.remindersDetail}>
              {Platform.OS === "web"
                ? `At ${String(reminderHour).padStart(2, "0")}:00 on training days, on the Equina app on your phone.`
                : `At ${String(reminderHour).padStart(2, "0")}:00 on training days you have not logged yet.`}
            </Text>
          </View>
          <Switch
            testID="training-plan-reminders"
            accessibilityLabel="Morning reminders"
            value={reminders}
            onValueChange={(value) => {
              selectionHaptic();
              setReminders(value);
            }}
            trackColor={{ false: equinaTheme.surfaces.elevated, true: equinaTheme.colorRole.positive }}
            thumbColor={equinaTheme.colors.ivory}
            ios_backgroundColor={equinaTheme.surfaces.elevated}
          />
        </View>

        <Text style={styles.note}>Changes count from today. The weeks you have already trained keep the plan they had.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <EquinaButton
          testID="training-plan-save"
          label={saving ? "Saving..." : "Save plan"}
          disabled={saving}
          onPress={() => void onSave(days, reminders).catch(() => undefined)}
        />
      </View>
    </EquinaSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: equinaTheme.spacing.md,
    paddingTop: equinaTheme.spacing.xs
  },
  intro: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  days: { gap: equinaTheme.spacing.sm },
  day: {
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.material.quiet,
    paddingVertical: equinaTheme.spacing.sm,
    paddingLeft: equinaTheme.spacing.md,
    paddingRight: equinaTheme.spacing.compact,
    gap: equinaTheme.spacing.compact
  },
  dayOn: { borderColor: "rgba(196,160,90,0.4)" },
  dayTop: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  dayCopy: { flex: 1, minWidth: 0, gap: 1 },
  dayName: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  daySummary: { ...equinaTheme.typography.meta, color: equinaTheme.colors.brass },
  dayRest: { color: equinaTheme.text.tertiary },
  dayEdit: { gap: equinaTheme.spacing.sm, paddingBottom: equinaTheme.spacing.xs },
  label: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: equinaTheme.spacing.sm },
  chip: {
    minHeight: 40,
    maxWidth: "100%",
    paddingHorizontal: 14,
    borderRadius: equinaTheme.radius.pill,
    borderWidth: 1,
    borderColor: equinaTheme.material.fieldBorder,
    alignItems: "center",
    justifyContent: "center"
  },
  chipSelected: { borderColor: equinaTheme.colors.brass, backgroundColor: equinaTheme.material.selected },
  chipText: { ...equinaTheme.typography.meta, color: equinaTheme.text.primary, fontWeight: "600" },
  chipTextSelected: { color: equinaTheme.colors.brass },
  reminders: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  remindersCopy: { flex: 1, gap: 2 },
  remindersTitle: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  remindersDetail: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  note: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  error: { ...equinaTheme.typography.meta, color: equinaTheme.colorRole.criticalOnDark }
});
