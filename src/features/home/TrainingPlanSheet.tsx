import { useEffect, useState } from "react";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react-native";
import type { TrainingPlanDay } from "../../backend";
import { EquinaButton, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { rideTrainingLabel, rideTrainingTypes } from "../ride/ride-plan";
import { reminderHour } from "../ride/training-reminders";

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export type PlanHorse = { id: string; name: string };

/** The rides of one weekday, in the order they were added. */
const entriesOf = (days: readonly TrainingPlanDay[], weekday: number) => days.filter((day) => day.weekday === weekday);

/**
 * The rider's training week: for each day, rest or one ride or more, each with
 * its training and horse. Saved from today on; the weeks before keep the plan
 * they had.
 *
 * Opened from a horse (`scopeHorseId`), it shows and edits only that horse's
 * days -- the same plan, seen from the horse. The other horses' rides stay as
 * they are and are named under each day.
 */
export function TrainingPlanSheet({
  visible,
  days: initialDays,
  reminders: initialReminders,
  horses,
  horseNames = {},
  scopeHorseId,
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
  /** The rider's own horses: the ones a day can be planned with. */
  horses: readonly PlanHorse[];
  /** Every horse the rider can see, for naming rides on a shared or archived horse. */
  horseNames?: Record<string, string>;
  /** Edits only this horse's days. */
  scopeHorseId?: string;
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

  const scoped = Boolean(scopeHorseId);
  const horseName = (id?: string) => (id ? horses.find((horse) => horse.id === id)?.name ?? horseNames[id] : undefined);
  const scopeName = horseName(scopeHorseId);
  const known = (id?: string) => (id && horses.some((horse) => horse.id === id) ? id : undefined);
  // In the horse's view a day is that horse's ride; in the week, all of them.
  const shownOf = (weekday: number) =>
    entriesOf(days, weekday).filter((entry) => !scoped || entry.horseId === scopeHorseId);
  const othersOf = (weekday: number) =>
    scoped ? entriesOf(days, weekday).filter((entry) => entry.horseId !== scopeHorseId) : [];

  const toggle = (weekday: number) => {
    selectionHaptic();
    if (shownOf(weekday).length) {
      setDays((current) => current.filter((entry) => entry.weekday !== weekday || (scoped && entry.horseId !== scopeHorseId)));
      if (open === weekday) setOpen(null);
      return;
    }
    const used = new Set(entriesOf(days, weekday).map((entry) => entry.horseId));
    const horseId = scopeHorseId
      ?? [known(defaultHorseId), ...horses.map((horse) => horse.id)].find((id) => id && !used.has(id));
    setDays((current) => [...current, { weekday, trainingType: defaultTrainingType, ...(horseId ? { horseId } : {}) }]);
    setOpen(weekday);
  };

  // Entries are told apart by weekday and horse, which the database keeps unique.
  const same = (entry: TrainingPlanDay, target: TrainingPlanDay) =>
    entry.weekday === target.weekday && entry.horseId === target.horseId;
  const change = (target: TrainingPlanDay, patch: Partial<TrainingPlanDay>) =>
    setDays((current) => current.map((entry) => (same(entry, target) ? { ...entry, ...patch } : entry)));
  const remove = (target: TrainingPlanDay) => setDays((current) => current.filter((entry) => !same(entry, target)));
  const addHorse = (weekday: number) => {
    const used = new Set(entriesOf(days, weekday).map((entry) => entry.horseId));
    const horseId = horses.find((horse) => !used.has(horse.id))?.id;
    if (!horseId) return;
    selectionHaptic();
    setDays((current) => [...current, { weekday, trainingType: defaultTrainingType, horseId }]);
  };

  return (
    <EquinaSheet
      visible={visible}
      title={scoped && scopeName ? `${scopeName}'s training` : "Training week"}
      onDismiss={saving ? () => undefined : onDismiss}
      closeTestID="training-plan-close"
    >
      <View style={styles.body} testID="training-plan">
        <Text style={styles.intro}>
          {scoped
            ? "The days this horse is ridden in your week, and the training for each. Your streak counts them."
            : "The days you plan to ride, with the horse and the training for each. Your streak counts them."}
        </Text>

        <View style={styles.days}>
          {dayNames.map((name, index) => {
            const weekday = index + 1;
            const shown = shownOf(weekday);
            const others = othersOf(weekday);
            const on = shown.length > 0;
            const expanded = open === weekday && on;
            const summary = on
              ? shown.map((entry) => [rideTrainingLabel(entry.trainingType), scoped ? undefined : horseName(entry.horseId)].filter(Boolean).join(" · ")).join(", ")
              : "Rest";
            const usedHorses = new Set(entriesOf(days, weekday).map((entry) => entry.horseId));
            const othersText = others
              .map((entry) => [rideTrainingLabel(entry.trainingType), horseName(entry.horseId)].filter(Boolean).join(" · "))
              .join(", ");
            return (
              <View key={name} style={[styles.day, on && styles.dayOn]}>
                <View style={styles.dayTop}>
                  <MotionPressable
                    testID={`training-plan-day-${weekday}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}: ${summary}${othersText ? `. Also ${othersText}` : ""}`}
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
                    {othersText ? <Text numberOfLines={1} style={styles.dayOthers}>Also {othersText}</Text> : null}
                  </MotionPressable>
                  {on ? (
                    expanded
                      ? <ChevronUp size={18} color={equinaTheme.text.secondary} />
                      : <ChevronDown size={18} color={equinaTheme.text.secondary} />
                  ) : null}
                  <Switch
                    testID={`training-plan-toggle-${weekday}`}
                    accessibilityLabel={scoped && scopeName ? `Ride ${scopeName} on ${name}` : `Ride on ${name}`}
                    value={on}
                    onValueChange={() => toggle(weekday)}
                    trackColor={{ false: equinaTheme.surfaces.elevated, true: equinaTheme.colorRole.positive }}
                    thumbColor={equinaTheme.colors.ivory}
                    ios_backgroundColor={equinaTheme.surfaces.elevated}
                  />
                </View>

                {expanded ? (
                  <View style={styles.dayEdit}>
                    {shown.map((entry, entryIndex) => (
                      <View key={`${entry.weekday}-${entry.horseId ?? "none"}`} style={[styles.entry, entryIndex > 0 && styles.entryNext]}>
                        {!scoped && horses.length > 0 ? (
                          <>
                            <View style={styles.entryTop}>
                              <Text style={styles.label}>Horse</Text>
                              {shown.length > 1 ? (
                                <MotionPressable
                                  testID={`training-plan-${weekday}-remove-${entry.horseId ?? "none"}`}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Remove ${horseName(entry.horseId) ?? "this ride"} from ${name}`}
                                  hitSlop={6}
                                  onPress={() => {
                                    selectionHaptic();
                                    remove(entry);
                                  }}
                                  style={styles.removeButton}
                                >
                                  <X size={16} color={equinaTheme.text.secondary} />
                                </MotionPressable>
                              ) : null}
                            </View>
                            <View accessibilityRole="radiogroup" style={styles.chips}>
                              {horses.map((horse) => {
                                const selected = horse.id === entry.horseId;
                                const taken = !selected && usedHorses.has(horse.id);
                                return (
                                  <MotionPressable
                                    key={horse.id}
                                    testID={`training-plan-${weekday}-horse-${horse.id}`}
                                    accessibilityRole="radio"
                                    accessibilityLabel={horse.name}
                                    accessibilityState={{ selected, disabled: taken }}
                                    disabled={taken}
                                    pressedScale={0.97}
                                    onPress={() => {
                                      if (!selected) selectionHaptic();
                                      change(entry, { horseId: horse.id });
                                    }}
                                    style={[styles.chip, selected && styles.chipSelected, taken && styles.chipTaken]}
                                  >
                                    <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>{horse.name}</Text>
                                  </MotionPressable>
                                );
                              })}
                            </View>
                          </>
                        ) : null}
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
                    {!scoped && horses.some((horse) => !usedHorses.has(horse.id)) ? (
                      <MotionPressable
                        testID={`training-plan-${weekday}-add-horse`}
                        accessibilityRole="button"
                        accessibilityLabel={`Ride another horse on ${name}`}
                        onPress={() => addHorse(weekday)}
                        style={styles.addHorse}
                      >
                        <Plus size={16} color={equinaTheme.colors.brass} />
                        <Text style={styles.addHorseText}>Another horse</Text>
                      </MotionPressable>
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
  dayOthers: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  dayEdit: { gap: equinaTheme.spacing.sm, paddingBottom: equinaTheme.spacing.xs },
  entry: { gap: equinaTheme.spacing.sm },
  entryNext: {
    borderTopWidth: 1,
    borderTopColor: equinaTheme.material.separator,
    paddingTop: equinaTheme.spacing.compact
  },
  entryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quietPressed
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
  chipTaken: { opacity: 0.35 },
  chipText: { ...equinaTheme.typography.meta, color: equinaTheme.text.primary, fontWeight: "600" },
  chipTextSelected: { color: equinaTheme.colors.brass },
  addHorse: {
    minHeight: 40,
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
  addHorseText: { ...equinaTheme.typography.meta, color: equinaTheme.colors.brass, fontWeight: "600" },
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
