import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { ChevronUp, Minus, Plus, RotateCcw, X } from "lucide-react-native";
import { EquinaButton, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { rideAlertsAllowed } from "./ride-cues";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import {
  addPhase,
  defaultRidePhases,
  editPhase,
  movePhaseUp,
  phasesFor,
  plannedMinutes,
  removePhase,
  ridePhaseLimits,
  ridePlanProblem,
  rideTrainingTypes,
  cleanPhases,
  setPhaseMinutes,
  type RidePhasePlan,
  type RidePlan,
  type RideSetupMemory,
  type RideTrainingType
} from "./ride-plan";

export type RideSetupHorse = { id?: string; name: string };

// The list is rebuilt on every render of the app, so horses compare by who
// they are, not by object. A horse from the demo has a name and no id.
const sameHorse = (left?: RideSetupHorse, right?: RideSetupHorse) =>
  Boolean(left && right && (left.id ?? left.name) === (right.id ?? right.name));

const samePhases = (left: RidePhasePlan[], right: RidePhasePlan[]) =>
  left.length === right.length
  && left.every((phase, index) => {
    const other = right[index];
    return other !== undefined
      && phase.title === other.title
      && phase.detail === other.detail
      && phase.minutes === other.minutes;
  });

/**
 * What the rider sets before getting on: the horse, the training, and the
 * phases with their minutes. Nothing starts here -- the clock waits on the
 * ride screen until the rider is in the saddle and taps Start.
 */
export function RideSetupSheet({
  visible,
  horses,
  horseId,
  trainingType,
  phases: initialPhases,
  memory,
  onContinue,
  onDismiss
}: {
  visible: boolean;
  horses: RideSetupHorse[];
  horseId?: string;
  trainingType: RideTrainingType;
  /** The phases to open with: the ride being edited, or the last ones for this training. */
  phases: RidePhasePlan[];
  memory: RideSetupMemory | null;
  onContinue: (plan: RidePlan) => void;
  onDismiss: () => void;
}) {
  const [horse, setHorse] = useState<RideSetupHorse | undefined>(undefined);
  const [training, setTraining] = useState(trainingType);
  const [phases, setPhases] = useState(initialPhases);
  // Phases the rider has not touched follow the training they pick; once
  // they edit, their edits stay when the training changes.
  const [edited, setEdited] = useState(false);
  // A phase just added opens with its name selected, ready to type over.
  const [addedId, setAddedId] = useState<string | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setHorse(horses.find((option) => option.id === horseId) ?? horses[0]);
    setTraining(trainingType);
    setPhases(initialPhases);
    setEdited(false);
    setAddedId(null);
    // Opening is the reset point; edits while open must survive re-renders.
  }, [visible]);

  const change = (next: RidePhasePlan[]) => {
    setPhases(next);
    setEdited(true);
  };

  const chooseTraining = (next: RideTrainingType) => {
    if (next.id === training.id) return;
    selectionHaptic();
    setTraining(next);
    if (!edited) {
      setPhases(phasesFor(memory, next));
      return;
    }
    // Kept edits still name the right training.
    setPhases((current) => current.map((phase) => (phase.detail === training.label ? { ...phase, detail: next.label } : phase)));
  };

  const problem = ridePlanProblem(phases);
  const total = plannedMinutes(phases);
  const atDefault = samePhases(cleanPhases(phases), defaultRidePhases(training));

  const submit = () => {
    if (problem) return;
    // Asked here, on the ground, never mid-ride: alerts are what reach a
    // locked phone. A no keeps the voice and the buzz with the screen on.
    if (Platform.OS !== "web") void rideAlertsAllowed(true);
    onContinue({
      ...(horse?.id ? { horseId: horse.id } : {}),
      horseName: horse?.name ?? "",
      trainingType: training,
      phases: cleanPhases(phases)
    });
  };

  return (
    <EquinaSheet visible={visible} title="Customize training" onDismiss={onDismiss} closeTestID="ride-setup-close">
      <View style={styles.body} testID="ride-setup">
        {horses.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Horse</Text>
            <View accessibilityRole="radiogroup" style={styles.chips}>
              {horses.map((option, index) => {
                const selected = sameHorse(option, horse);
                return (
                  <MotionPressable
                    key={option.id ?? `horse-${index}`}
                    testID={`ride-setup-horse-${index}`}
                    accessibilityRole="radio"
                    accessibilityLabel={option.name}
                    accessibilityState={{ selected }}
                    pressedScale={0.97}
                    onPress={() => {
                      if (!selected) selectionHaptic();
                      setHorse(option);
                    }}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>{option.name}</Text>
                  </MotionPressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Training</Text>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {rideTrainingTypes.map((option) => {
              const selected = option.id === training.id;
              return (
                <MotionPressable
                  key={option.id}
                  testID={`ride-setup-training-${option.id}`}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  pressedScale={0.97}
                  onPress={() => chooseTraining(option)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
                </MotionPressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Training plan</Text>
            <Text testID="ride-setup-total" style={styles.sectionTotal}>{total} min</Text>
          </View>
          <View style={styles.phaseList}>
            {phases.map((phase, index) => (
              <PhaseRow
                key={phase.id}
                phase={phase}
                index={index}
                justAdded={phase.id === addedId}
                canMoveUp={index > 0}
                canRemove={phases.length > 1}
                onTitle={(title) => change(editPhase(phases, phase.id, { title }))}
                onDetail={(detail) => change(editPhase(phases, phase.id, { detail }))}
                onMinutes={(minutes) => change(setPhaseMinutes(phases, phase.id, minutes))}
                onMoveUp={() => change(movePhaseUp(phases, phase.id))}
                onRemove={() => change(removePhase(phases, phase.id))}
              />
            ))}
          </View>
          <View style={styles.phaseActions}>
            <MotionPressable
              testID="ride-setup-add-phase"
              accessibilityRole="button"
              accessibilityLabel="Add a phase"
              accessibilityState={{ disabled: phases.length >= ridePhaseLimits.maxPhases }}
              disabled={phases.length >= ridePhaseLimits.maxPhases}
              onPress={() => {
                selectionHaptic();
                nextId.current += 1;
                const id = `phase-${Date.now()}-${nextId.current}`;
                setAddedId(id);
                change(addPhase(phases, id));
              }}
              style={[styles.addPhase, phases.length >= ridePhaseLimits.maxPhases && styles.disabled]}
            >
              <Plus size={17} color={equinaTheme.colors.brass} />
              <Text style={styles.addPhaseText}>Add a phase</Text>
            </MotionPressable>
            {!atDefault ? (
              <MotionPressable
                testID="ride-setup-reset"
                accessibilityRole="button"
                accessibilityLabel="Reset to the usual phases"
                onPress={() => {
                  selectionHaptic();
                  change(defaultRidePhases(training));
                }}
                style={styles.reset}
              >
                <RotateCcw size={15} color={equinaTheme.text.secondary} />
                <Text style={styles.resetText}>Usual phases</Text>
              </MotionPressable>
            ) : null}
          </View>
        </View>

        <Text style={styles.note}>
          {Platform.OS === "web"
            ? "Nothing is timed yet: the clock starts when you tap Start phase on the next screen. Keep this page open; the screen stays on so your phone can call out each phase."
            : "Nothing is timed yet: the clock starts when you tap Start phase on the next screen. At each new phase your phone chimes, vibrates and says what comes next, with a notification if the screen is locked."}
        </Text>
        {problem ? <Text accessibilityRole="alert" style={styles.problem}>{problem}</Text> : null}
        <EquinaButton
          testID="ride-setup-continue"
          label="Start training"
          disabled={Boolean(problem)}
          onPress={submit}
        />
      </View>
    </EquinaSheet>
  );
}

function PhaseRow({
  phase,
  index,
  justAdded,
  canMoveUp,
  canRemove,
  onTitle,
  onDetail,
  onMinutes,
  onMoveUp,
  onRemove
}: {
  phase: RidePhasePlan;
  index: number;
  justAdded: boolean;
  canMoveUp: boolean;
  canRemove: boolean;
  onTitle: (title: string) => void;
  onDetail: (detail: string) => void;
  onMinutes: (minutes: number) => void;
  onMoveUp: () => void;
  onRemove: () => void;
}) {
  const [focused, setFocused] = useState<"title" | "detail" | null>(null);
  const name = phase.title.trim() || `Phase ${index + 1}`;
  const step = (by: number) => {
    const next = Math.min(ridePhaseLimits.maxMinutes, Math.max(ridePhaseLimits.minMinutes, phase.minutes + by));
    if (next !== phase.minutes) selectionHaptic();
    onMinutes(next);
  };

  return (
    <View testID={`ride-setup-phase-${index}`} style={styles.phase}>
      <View style={styles.phaseTop}>
        <Text style={styles.phaseNumber}>{index + 1}</Text>
        <TextInput
          testID={`ride-setup-phase-${index}-title`}
          accessibilityLabel={`Phase ${index + 1} name`}
          value={phase.title}
          onChangeText={onTitle}
          onFocus={() => setFocused("title")}
          onBlur={() => setFocused(null)}
          placeholder="Name this phase"
          autoFocus={justAdded}
          selectTextOnFocus
          placeholderTextColor={equinaTheme.text.tertiary}
          selectionColor={equinaTheme.colors.brass}
          maxLength={ridePhaseLimits.titleLength}
          returnKeyType="done"
          style={[styles.phaseTitle, focused === "title" && styles.inputFocused, styles.webInput]}
        />
        {canMoveUp ? (
          <MotionPressable
            testID={`ride-setup-phase-${index}-up`}
            accessibilityRole="button"
            accessibilityLabel={`Move ${name} earlier`}
            hitSlop={4}
            onPress={() => {
              selectionHaptic();
              onMoveUp();
            }}
            style={styles.phaseIcon}
          >
            <ChevronUp size={18} color={equinaTheme.text.secondary} />
          </MotionPressable>
        ) : null}
        {canRemove ? (
          <MotionPressable
            testID={`ride-setup-phase-${index}-remove`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${name}`}
            hitSlop={4}
            onPress={() => {
              selectionHaptic();
              onRemove();
            }}
            style={styles.phaseIcon}
          >
            <X size={17} color={equinaTheme.text.secondary} />
          </MotionPressable>
        ) : null}
      </View>
      <View style={styles.phaseBottom}>
        <TextInput
          testID={`ride-setup-phase-${index}-detail`}
          accessibilityLabel={`Phase ${index + 1} gait or focus`}
          value={phase.detail}
          onChangeText={onDetail}
          onFocus={() => setFocused("detail")}
          onBlur={() => setFocused(null)}
          placeholder="Gait or focus"
          selectTextOnFocus
          placeholderTextColor={equinaTheme.text.tertiary}
          selectionColor={equinaTheme.colors.brass}
          maxLength={ridePhaseLimits.detailLength}
          returnKeyType="done"
          style={[styles.phaseDetail, focused === "detail" && styles.inputFocused, styles.webInput]}
        />
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${name} length`}
          accessibilityValue={{ text: `${phase.minutes} ${phase.minutes === 1 ? "minute" : "minutes"}` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => step(event.nativeEvent.actionName === "increment" ? 1 : -1)}
          style={styles.stepper}
        >
          <MotionPressable
            testID={`ride-setup-phase-${index}-shorter`}
            accessibilityRole="button"
            accessibilityLabel={`Shorter ${name}`}
            disabled={phase.minutes <= ridePhaseLimits.minMinutes}
            onPress={() => step(-1)}
            onLongPress={() => step(-5)}
            style={[styles.stepButton, phase.minutes <= ridePhaseLimits.minMinutes && styles.disabled]}
          >
            <Minus size={16} color={equinaTheme.text.primary} />
          </MotionPressable>
          <Text testID={`ride-setup-phase-${index}-minutes`} style={styles.stepValue}>{phase.minutes} min</Text>
          <MotionPressable
            testID={`ride-setup-phase-${index}-longer`}
            accessibilityRole="button"
            accessibilityLabel={`Longer ${name}`}
            disabled={phase.minutes >= ridePhaseLimits.maxMinutes}
            onPress={() => step(1)}
            onLongPress={() => step(5)}
            style={[styles.stepButton, phase.minutes >= ridePhaseLimits.maxMinutes && styles.disabled]}
          >
            <Plus size={16} color={equinaTheme.text.primary} />
          </MotionPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: equinaTheme.spacing.lg,
    paddingTop: equinaTheme.spacing.xs
  },
  section: {
    gap: equinaTheme.spacing.compact
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between"
  },
  sectionLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  sectionTotal: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: equinaTheme.spacing.sm
  },
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
  chipSelected: {
    borderColor: equinaTheme.colors.brass,
    backgroundColor: equinaTheme.material.selected
  },
  chipText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  chipTextSelected: {
    color: equinaTheme.colors.brass
  },
  phaseList: {
    gap: equinaTheme.spacing.sm
  },
  phase: {
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.material.quiet,
    paddingVertical: equinaTheme.spacing.compact,
    paddingLeft: equinaTheme.spacing.compact,
    paddingRight: equinaTheme.spacing.sm,
    gap: equinaTheme.spacing.sm
  },
  phaseTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  phaseNumber: {
    width: 22,
    color: equinaTheme.colors.brass,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    textAlign: "center"
  },
  phaseTitle: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 0,
    color: equinaTheme.text.primary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600",
    borderBottomWidth: 1,
    borderBottomColor: equinaTheme.material.fieldBorder
  },
  phaseDetail: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    marginLeft: 30,
    paddingVertical: 6,
    paddingHorizontal: 0,
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 19,
    borderBottomWidth: 1,
    borderBottomColor: equinaTheme.material.fieldBorder
  },
  inputFocused: {
    borderBottomColor: equinaTheme.colors.brass
  },
  webInput: {
    outlineStyle: "none"
  } as never,
  phaseIcon: {
    width: 36,
    height: 36,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center"
  },
  phaseBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quietPressed
  },
  stepValue: {
    minWidth: 58,
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    textAlign: "center"
  },
  phaseActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.compact
  },
  addPhase: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: equinaTheme.radius.control,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(196,160,90,0.55)",
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  addPhaseText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  reset: {
    minHeight: 44,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  resetText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  disabled: {
    opacity: 0.4
  },
  note: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  problem: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colorRole.criticalOnDark
  }
});
