import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import type { TrainingPlanDay } from "../../backend";
import { EquinaButton, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { rideTrainingLabel, rideTrainingTypes } from "../ride/ride-plan";
import { reminderHour } from "../ride/training-reminders";

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** The rides of one weekday, in the order they were added. */
const entriesOf = (days: readonly TrainingPlanDay[], weekday: number) => days.filter((day) => day.weekday === weekday);

/**
 * One horse's training week: for each day, rest or a ride, with its training.
 * Saved from today on; the weeks before keep the plan they had.
 *
 * Each horse has its own week, so the sheet is always opened for one horse
 * (`scopeHorseId`) and shows and edits only that horse's days; the other
 * horses' days stay as they are and are not shown. Only a rider with no horse
 * at all opens it without one, on the week as it always was.
 */
export function TrainingPlanSheet({
  visible,
  days: initialDays,
  reminders: initialReminders,
  scopeHorseId,
  scopeHorseName,
  remindersForAllHorses = false,
  defaultTrainingType,
  saving,
  error,
  onSave,
  onDismiss
}: {
  visible: boolean;
  days: readonly TrainingPlanDay[];
  reminders: boolean;
  /** Edits only this horse's days. */
  scopeHorseId?: string;
  scopeHorseName?: string;
  /** The rider has more than one horse of their own: the one switch covers them all, and says so. */
  remindersForAllHorses?: boolean;
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

  const scoped = Boolean(scopeHorseId);
  const scopeName = scoped ? scopeHorseName : undefined;
  // In the horse's view a day is that horse's ride; without a horse, all of them.
  const shownOf = (weekday: number) =>
    entriesOf(days, weekday).filter((entry) => !scoped || entry.horseId === scopeHorseId);

  const toggle = (weekday: number) => {
    selectionHaptic();
    if (shownOf(weekday).length) {
      setDays((current) => current.filter((entry) => entry.weekday !== weekday || (scoped && entry.horseId !== scopeHorseId)));
      if (open === weekday) setOpen(null);
      return;
    }
    setDays((current) => [...current, { weekday, trainingType: defaultTrainingType, ...(scopeHorseId ? { horseId: scopeHorseId } : {}) }]);
    setOpen(weekday);
  };

  // Entries are told apart by weekday and horse, which the database keeps unique.
  const same = (entry: TrainingPlanDay, target: TrainingPlanDay) =>
    entry.weekday === target.weekday && entry.horseId === target.horseId;
  const change = (target: TrainingPlanDay, patch: Partial<TrainingPlanDay>) =>
    setDays((current) => current.map((entry) => (same(entry, target) ? { ...entry, ...patch } : entry)));
  const remindersDetail = Platform.OS === "web"
    ? `At ${String(reminderHour).padStart(2, "0")}:00 on training days, on the Equina app on your phone.`
    : `At ${String(reminderHour).padStart(2, "0")}:00 on training days you have not logged yet.`;

  // One switch for the rider: opened for one of several horses, it says it
  // covers them all. With a single horse there is nothing more to cover.
  const remindersTitle = remindersForAllHorses ? "Morning reminders, for all your horses" : "Morning reminders";

  return (
    <EquinaSheet
      visible={visible}
      title={scopeName ? `${scopeName}'s training week` : "Training week"}
      onDismiss={saving ? () => undefined : onDismiss}
      closeTestID="training-plan-close"
    >
      <View style={styles.body} testID="training-plan">
        <Text style={styles.intro}>
          {scoped
            ? `The days you ride ${scopeName ?? "this horse"}, and the training for each. ${scopeName ? `${scopeName}'s` : "Its"} streak counts them.`
            : "The days you plan to ride, and the training for each. Your streak counts them."}
        </Text>

        <View style={styles.days}>
          {dayNames.map((name, index) => {
            const weekday = index + 1;
            const shown = shownOf(weekday);
            const on = shown.length > 0;
            const expanded = open === weekday && on;
            const summary = on ? shown.map((entry) => rideTrainingLabel(entry.trainingType)).join(", ") : "Rest";
            return (
              <View key={name} style={[styles.day, on && styles.dayOn]}>
                <View style={styles.dayTop}>
                  <MotionPressable
                    testID={`training-plan-day-${weekday}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}: ${summary}`}
                    accessibilityHint={on ? "Shows the training for this day" : undefined}
                    disabled={!on}
                    onPress={() => {
                      selectionHaptic();
                      setOpen(expanded ? null : weekday);
                    }}
                    style={styles.dayCopy}
                  >
                    <Text style={styles.dayName}>{name}</Text>
                    <Text numberOfLines={2} style={[styles.daySummary, !on && styles.dayRest]}>{summary}</Text>
                  </MotionPressable>
                  {on ? (
                    expanded
                      ? <ChevronUp size={18} color={equinaTheme.text.secondary} />
                      : <ChevronDown size={18} color={equinaTheme.text.secondary} />
                  ) : null}
                  {/* Only drawn, as in SettingsRow. Touched directly, iOS's switch plays
                      its press animation first and catches up after the day has opened;
                      here the tap flips the day and the switch slides with it. */}
                  <Pressable
                    testID={`training-plan-toggle-${weekday}`}
                    accessibilityRole="switch"
                    accessibilityLabel={scopeName ? `Ride ${scopeName} on ${name}` : `Ride on ${name}`}
                    accessibilityState={{ checked: on }}
                    hitSlop={8}
                    onPress={() => toggle(weekday)}
                  >
                    <View pointerEvents="none" accessible={false}>
                      <Switch
                        accessible={false}
                        value={on}
                        trackColor={{ false: equinaTheme.surfaces.elevated, true: equinaTheme.colorRole.positive }}
                        thumbColor={equinaTheme.colors.ivory}
                        ios_backgroundColor={equinaTheme.surfaces.elevated}
                      />
                    </View>
                  </Pressable>
                </View>

                {expanded ? (
                  <View style={styles.dayEdit}>
                    {shown.map((entry, entryIndex) => (
                      <View key={`${entry.weekday}-${entry.horseId ?? "none"}`} style={[styles.entry, entryIndex > 0 && styles.entryNext]}>
                        <Text style={styles.label}>Training</Text>
                        <View accessibilityRole="radiogroup" style={styles.chips}>
                          {rideTrainingTypes.map((type) => {
                            const selected = type.id === entry.trainingType;
                            return (
                              <MotionPressable
                                key={type.id}
                                testID={`training-plan-${weekday}-${entry.horseId ?? "none"}-${type.id}`}
                                accessibilityRole="radio"
                                accessibilityLabel={type.label}
                                accessibilityState={{ selected }}
                                pressedScale={0.97}
                                onPress={() => {
                                  if (!selected) selectionHaptic();
                                  change(entry, { trainingType: type.id });
                                }}
                                style={[styles.chip, selected && styles.chipSelected]}
                              >
                                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{type.label}</Text>
                              </MotionPressable>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <Pressable
          testID="training-plan-reminders"
          accessibilityRole="switch"
          accessibilityLabel={remindersTitle}
          accessibilityHint={remindersDetail}
          accessibilityState={{ checked: reminders }}
          onPress={() => {
            selectionHaptic();
            setReminders((current) => !current);
          }}
          style={styles.reminders}
        >
          <View style={styles.remindersCopy}>
            <Text style={styles.remindersTitle}>{remindersTitle}</Text>
            <Text style={styles.remindersDetail}>{remindersDetail}</Text>
          </View>
          <View pointerEvents="none" accessible={false}>
            <Switch
              accessible={false}
              value={reminders}
              trackColor={{ false: equinaTheme.surfaces.elevated, true: equinaTheme.colorRole.positive }}
              thumbColor={equinaTheme.colors.ivory}
              ios_backgroundColor={equinaTheme.surfaces.elevated}
            />
          </View>
        </Pressable>

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
  entry: { gap: equinaTheme.spacing.sm },
  entryNext: {
    borderTopWidth: 1,
    borderTopColor: equinaTheme.material.separator,
    paddingTop: equinaTheme.spacing.compact
  },
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
