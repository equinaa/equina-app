import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import type { HorseTimeOffInput } from "../../backend";
import { localToday } from "../../domain/local-day";
import { addDays } from "../../domain/training-streak";
import { EquinaButton, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { timeOffBackDays, timeOffKinds, timeOffMaxSpan, timeOffProblem } from "./time-off";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Today", "Tomorrow", "Yesterday", else "Mon 3 Nov". */
const dayLabel = (day: string, today: string) => {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  const date = new Date(`${day}T00:00:00Z`);
  return `${weekdays[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
};

/** A day stepped a day at a time; held, a week at a time. No native date picker. */
function DayStepper({
  label,
  day,
  today,
  min,
  max,
  testID,
  onChange
}: {
  label: string;
  day: string;
  today: string;
  min: string;
  max: string;
  testID: string;
  onChange: (day: string) => void;
}) {
  const step = (by: number) => {
    let next = addDays(day, by);
    if (next < min) next = min;
    if (next > max) next = max;
    if (next !== day) selectionHaptic();
    onChange(next);
  };
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: dayLabel(day, today) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => step(event.nativeEvent.actionName === "increment" ? 1 : -1)}
        style={styles.stepper}
      >
        <MotionPressable
          testID={`${testID}-earlier`}
          accessibilityRole="button"
          accessibilityLabel={`${label} earlier`}
          disabled={day <= min}
          onPress={() => step(-1)}
          onLongPress={() => step(-7)}
          style={[styles.stepButton, day <= min && styles.disabled]}
        >
          <Minus size={16} color={equinaTheme.text.primary} />
        </MotionPressable>
        <Text testID={testID} style={styles.stepValue}>{dayLabel(day, today)}</Text>
        <MotionPressable
          testID={`${testID}-later`}
          accessibilityRole="button"
          accessibilityLabel={`${label} later`}
          disabled={day >= max}
          onPress={() => step(1)}
          onLongPress={() => step(7)}
          style={[styles.stepButton, day >= max && styles.disabled]}
        >
          <Plus size={16} color={equinaTheme.text.primary} />
        </MotionPressable>
      </View>
    </View>
  );
}

/**
 * Putting a horse on time off: why, the first and the last day. While it is
 * off, its planned rides are not due -- no reminder, and the streak carries on.
 */
export function HorseTimeOffSheet({
  visible,
  horseId,
  horseName,
  onSave,
  onDismiss
}: {
  visible: boolean;
  horseId: string;
  horseName: string;
  onSave: (input: HorseTimeOffInput) => Promise<unknown>;
  onDismiss: () => void;
}) {
  const [kind, setKind] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const today = localToday();
    setKind("rest");
    setStartsOn(today);
    setEndsOn(today);
    setNote("");
    setSaving(inFlight.current);
    setSaveError("");
  }, [visible]);

  const today = localToday();
  const input = { horseId, kind, startsOn, endsOn, ...(note.trim() ? { note: note.trim() } : {}) };
  const problem = startsOn ? timeOffProblem(input, today) : null;

  const save = async () => {
    if (problem || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(input);
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : "The time off could not be saved.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <EquinaSheet
      visible={visible}
      title={`${horseName} off work`}
      onDismiss={saving ? () => undefined : onDismiss}
      closeTestID="time-off-close"
    >
      <View style={styles.body} testID="time-off">
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Why</Text>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {timeOffKinds.map((option) => {
              const selected = option.id === kind;
              return (
                <MotionPressable
                  key={option.id}
                  testID={`time-off-kind-${option.id}`}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  pressedScale={0.97}
                  onPress={() => {
                    if (!selected) selectionHaptic();
                    setKind(option.id);
                  }}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
                </MotionPressable>
              );
            })}
          </View>
        </View>

        {startsOn ? (
          <View style={styles.section}>
            <DayStepper
              label="From"
              day={startsOn}
              today={today}
              min={addDays(today, -timeOffBackDays)}
              max={addDays(today, timeOffMaxSpan)}
              testID="time-off-from"
              onChange={(day) => {
                setStartsOn(day);
                if (endsOn < day) setEndsOn(day);
              }}
            />
            <DayStepper
              label="Until"
              day={endsOn}
              today={today}
              min={startsOn}
              max={addDays(startsOn, timeOffMaxSpan)}
              testID="time-off-until"
              onChange={setEndsOn}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{kind === "other" ? "Note" : "Note (optional)"}</Text>
          <TextInput
            testID="time-off-note"
            accessibilityLabel="Note"
            value={note}
            onChangeText={setNote}
            placeholder={kind === "stall-rest" || kind === "injury" || kind === "vet" ? "What the vet said, what to watch" : "Anything worth remembering"}
            placeholderTextColor={equinaTheme.text.tertiary}
            selectionColor={equinaTheme.colors.brass}
            maxLength={500}
            multiline
            style={[styles.noteInput, styles.webInput]}
          />
        </View>

        <Text style={styles.hint}>
          Planned rides on {horseName} these days are not due: no reminder, and your streak carries on.
        </Text>
        {problem ? <Text accessibilityRole="alert" style={styles.error}>{problem}</Text> : null}
        {!problem && saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
        <EquinaButton
          testID="time-off-save"
          label={saving ? "Saving..." : "Save time off"}
          disabled={Boolean(problem) || saving}
          onPress={() => void save()}
        />
      </View>
    </EquinaSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: equinaTheme.spacing.lg, paddingTop: equinaTheme.spacing.xs },
  section: { gap: equinaTheme.spacing.compact },
  sectionLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: equinaTheme.spacing.sm },
  chip: {
    minHeight: 40,
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
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: equinaTheme.spacing.compact },
  stepLabel: { ...equinaTheme.typography.body, color: equinaTheme.text.primary },
  stepper: { flexDirection: "row", alignItems: "center", gap: 2 },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quietPressed
  },
  stepValue: {
    minWidth: 112,
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center"
  },
  disabled: { opacity: 0.4 },
  noteInput: {
    minHeight: 72,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: equinaTheme.radius.control,
    borderWidth: 1,
    borderColor: equinaTheme.material.fieldBorder,
    backgroundColor: equinaTheme.material.field,
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    textAlignVertical: "top"
  },
  webInput: { outlineStyle: "none" } as never,
  hint: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  error: { ...equinaTheme.typography.meta, color: equinaTheme.colorRole.criticalOnDark }
});
