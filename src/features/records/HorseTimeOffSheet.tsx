import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { HorseTimeOffInput } from "../../backend";
import { localToday } from "../../domain/local-day";
import { EquinaDateRangeCalendar } from "../../ui/primitives/EquinaDateRangeCalendar";
import { EquinaButton, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { timeOffKinds, timeOffLimits, timeOffProblem } from "./time-off";

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
    if (!visible) {
      // The calendar opens on the month of the first day and keeps its place
      // from there. Without a first day it is not shown, so the next opening
      // mounts it anew, on today, rather than where the last one was left.
      setStartsOn("");
      return;
    }
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
            <Text style={styles.sectionLabel}>When</Text>
            <EquinaDateRangeCalendar
              testID="time-off"
              startsOn={startsOn}
              endsOn={endsOn}
              today={today}
              {...timeOffLimits(today)}
              onChange={(from, until) => {
                setStartsOn(from);
                setEndsOn(until);
              }}
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
  error: { ...equinaTheme.typography.meta, color: equinaTheme.colorRole.criticalOnDark }
});
