import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { ChevronUp, Minus, Plus, RotateCcw, X } from "lucide-react-native";
import type { RideMood } from "./RideExperience";
import { EquinaButton, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { cuePhaseChange, prepareRideCues, rideAlertsAllowed } from "./ride-cues";
import { localDayOf } from "../../domain/local-day";
import { WeekDayPicker } from "../calendar/WeekDayPicker";
import { NotificationNoticeCard } from "../notifications/NotificationNoticeCard";
import type { TapNotice } from "../notifications/notification-routes";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import {
  activityIsAhead,
  activityProblem,
  activityTimeExists,
  addPhase,
  defaultActivityStart,
  defaultRidePhases,
  editPhase,
  movePhaseUp,
  phasesFor,
  plannedMinutes,
  removePhase,
  ridePhaseLimits,
  ridePlanProblem,
  scheduleProblem,
  rideTrainingTypes,
  cleanPhases,
  setPhaseMinutes,
  formatActivityTime,
  type ActivityDraft,
  type RidePhasePlan,
  type RidePlan,
  type RideSetupMemory,
  type RideTrainingType
} from "./ride-plan";

export type RideSetupHorse = { id?: string; name: string };

/** A training logged with Add activity, with what the rider added about it. */
export type LoggedActivity = { draft: ActivityDraft; mood?: RideMood; note?: string };

const moods: readonly RideMood[] = ["Fresh", "Focused", "Tender"];
const minutesInDay = 24 * 60;

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
 * phases with their minutes. Start training starts the clock and the first
 * phase at once, so the rider can put the phone away straight after.
 *
 * The same sheet logs a training done without the clock ("Add activity"):
 * the rider also says when it was, and it goes straight into the journal.
 */
export function RideSetupSheet({
  visible,
  mode = "ride",
  horses,
  horseId,
  trainingType,
  phases: initialPhases,
  memory,
  day: requestedDay,
  onContinue,
  onLog,
  onSchedule,
  notice,
  onDismissNotice,
  openedFor,
  onDismiss
}: {
  visible: boolean;
  /** "log" is Add activity: nothing is timed, the training is saved as done. */
  mode?: "ride" | "log";
  horses: RideSetupHorse[];
  horseId?: string;
  trainingType: RideTrainingType;
  /** The phases to open with: the last ones for this training, or the yard's. */
  phases: RidePhasePlan[];
  memory: RideSetupMemory | null;
  /**
   * Add activity only: the day picked in the calendar, any of the last month.
   * Without one the sheet opens on the latest time the training could have
   * ended by now.
   */
  day?: string;
  onContinue?: (plan: RidePlan) => void;
  /** Saves a logged activity. The sheet stays open, with what was entered, if it fails. */
  onLog?: (activity: LoggedActivity) => Promise<void>;
  /**
   * Add activity on a day ahead (or later today): schedules it instead of
   * logging it. Without it, only days already gone can be picked.
   */
  onSchedule?: (activity: { draft: ActivityDraft; note?: string }) => Promise<void>;
  /** The training-day reminder tapped to open the sheet, shown at its top. */
  notice?: TapNotice | null;
  onDismissNotice?: () => void;
  /**
   * What the sheet was opened for, when not by the rider's own tap (a
   * notification's key). A new one sets the sheet up again while it is
   * open, with the horse and training it names.
   */
  openedFor?: string;
  onDismiss: () => void;
}) {
  const logging = mode === "log";
  const [horse, setHorse] = useState<RideSetupHorse | undefined>(undefined);
  const [training, setTraining] = useState(trainingType);
  const [phases, setPhases] = useState(initialPhases);
  // Phases the rider has not touched follow the training they pick; once
  // they edit, their edits stay when the training changes.
  const [edited, setEdited] = useState(false);
  // A phase just added opens with its name selected, ready to type over.
  const [addedId, setAddedId] = useState<string | null>(null);
  const nextId = useRef(0);
  // Add activity only.
  const [day, setDay] = useState("");
  const [startMinutes, setStartMinutes] = useState(0);
  const [mood, setMood] = useState<RideMood | undefined>(undefined);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // A save outlives the sheet closing and opening again, so it can never be
  // sent twice.
  const inFlight = useRef(false);
  // Start training waits on the notification question; a second tap meanwhile
  // must not start a second ride.
  const starting = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setHorse(horses.find((option) => option.id === horseId) ?? horses[0]);
    setTraining(trainingType);
    setPhases(initialPhases);
    setEdited(false);
    setAddedId(null);
    const opening = defaultActivityStart(Date.now(), plannedMinutes(initialPhases));
    setDay(requestedDay ?? opening.day);
    // A day ahead from the calendar opens on a morning ride, not on now.
    const openingToday = localDayOf(Date.now()) as string;
    setStartMinutes(requestedDay && requestedDay > openingToday ? 9 * 60 : opening.startMinutes);
    setMood(undefined);
    setNote("");
    setSaving(inFlight.current);
    setSaveError("");
    // A browser plays sound only in answer to a tap, and the chime for the
    // first phase comes from the tap on Start training: it has to be loaded
    // by then.
    if (!logging && Platform.OS === "web") void prepareRideCues();
    // Opening is the reset point; edits while open must survive re-renders.
  }, [visible, openedFor]);

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

  const now = Date.now();
  const plan: RidePlan = {
    ...(horse?.id ? { horseId: horse.id } : {}),
    horseName: horse?.name ?? "",
    trainingType: training,
    phases: cleanPhases(phases)
  };
  const draft: ActivityDraft = { day, startMinutes, plan };
  // A day ahead, or later today, is scheduled rather than logged.
  const scheduling = logging && Boolean(onSchedule) && activityIsAhead(draft, now);
  const problem = scheduling
    ? scheduleProblem(draft, now)
    : logging ? activityProblem(draft, now) : ridePlanProblem(phases);
  const total = plannedMinutes(phases);
  const atDefault = samePhases(cleanPhases(phases), defaultRidePhases(training));

  const clampStart = (minutes: number) => Math.min(minutesInDay - 15, Math.max(0, minutes));
  const stepStart = (by: number) => {
    let next = clampStart(startMinutes + by);
    // Skip the hour the clocks jump over.
    while (!activityTimeExists(day, next) && next > 0 && next < minutesInDay - 15) next = clampStart(next + Math.sign(by) * 15);
    if (next !== startMinutes) selectionHaptic();
    setStartMinutes(next);
  };

  const save = async () => {
    if (problem || inFlight.current || !(scheduling ? onSchedule : onLog)) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError("");
    try {
      if (scheduling && onSchedule) await onSchedule({ draft, ...(note.trim() ? { note: note.trim() } : {}) });
      else if (onLog) await onLog({ draft, ...(mood ? { mood } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : scheduling ? "The activity could not be scheduled." : "The activity could not be saved.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const submit = async () => {
    if (logging) {
      void save();
      return;
    }
    if (problem || !onContinue || starting.current) return;
    if (Platform.OS === "web") {
      // Inside the tap itself, or the browser keeps every chime of the ride silent.
      cuePhaseChange("phase", true);
      onContinue(plan);
      return;
    }
    starting.current = true;
    try {
      // Asked here, on the ground, never mid-ride, and answered before the
      // clock starts: alerts are what reach a locked phone, and the first
      // phase's are scheduled the moment the ride opens. A no keeps the chime
      // and the buzz with the screen on.
      await rideAlertsAllowed(true);
      await prepareRideCues();
      cuePhaseChange("phase");
      onContinue(plan);
    } finally {
      starting.current = false;
    }
  };

  return (
    <EquinaSheet
      visible={visible}
      title={scheduling ? "Schedule activity" : logging ? "Add activity" : "Customize training"}
      // Held open while saving: closed mid-save, a failure would go unseen.
      onDismiss={saving ? () => undefined : onDismiss}
      closeTestID={logging ? "add-activity-close" : "ride-setup-close"}
    >
      <View style={styles.body} testID={logging ? "add-activity-sheet" : "ride-setup"}>
        {notice && onDismissNotice && !logging ? (
          <NotificationNoticeCard notice={notice} onDismiss={onDismissNotice} testID="ride-setup-notice" />
        ) : null}
        {logging ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>When</Text>
            <WeekDayPicker value={day} today={localDayOf(now) as string} ahead={Boolean(onSchedule)} onChange={setDay} />
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>{scheduling ? "Starts at" : "Started at"}</Text>
              <View
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Start time"
                accessibilityValue={{ text: formatActivityTime(startMinutes) }}
                accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                onAccessibilityAction={(event) => stepStart(event.nativeEvent.actionName === "increment" ? 15 : -15)}
                style={styles.stepper}
              >
                <MotionPressable
                  testID="add-activity-earlier"
                  accessibilityRole="button"
                  accessibilityLabel="Earlier start"
                  disabled={startMinutes <= 0}
                  onPress={() => stepStart(-15)}
                  onLongPress={() => stepStart(-60)}
                  style={[styles.stepButton, startMinutes <= 0 && styles.disabled]}
                >
                  <Minus size={16} color={equinaTheme.text.primary} />
                </MotionPressable>
                <Text testID="add-activity-start" style={styles.stepValue}>{formatActivityTime(startMinutes)}</Text>
                <MotionPressable
                  testID="add-activity-later"
                  accessibilityRole="button"
                  accessibilityLabel="Later start"
                  disabled={startMinutes >= minutesInDay - 15}
                  onPress={() => stepStart(15)}
                  onLongPress={() => stepStart(60)}
                  style={[styles.stepButton, startMinutes >= minutesInDay - 15 && styles.disabled]}
                >
                  <Plus size={16} color={equinaTheme.text.primary} />
                </MotionPressable>
              </View>
            </View>
          </View>
        ) : null}

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

        {logging ? (
          <>
            {scheduling ? null : (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>How the horse felt</Text>
              <View accessibilityRole="radiogroup" style={styles.chips}>
                {moods.map((option) => {
                  const selected = option === mood;
                  return (
                    <MotionPressable
                      key={option}
                      testID={`add-activity-mood-${option.toLowerCase()}`}
                      accessibilityRole="radio"
                      accessibilityLabel={option}
                      accessibilityState={{ selected }}
                      pressedScale={0.97}
                      onPress={() => {
                        selectionHaptic();
                        // Optional: tapping the chosen feeling again takes it back.
                        setMood(selected ? undefined : option);
                      }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option}</Text>
                    </MotionPressable>
                  );
                })}
              </View>
            </View>
            )}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Note</Text>
              <TextInput
                testID="add-activity-note"
                accessibilityLabel="Note"
                value={note}
                onChangeText={setNote}
                placeholder={scheduling ? "What to work on, who's teaching" : "What worked, what to try next time"}
                placeholderTextColor={equinaTheme.text.tertiary}
                selectionColor={equinaTheme.colors.brass}
                maxLength={2000}
                multiline
                style={[styles.noteInput, styles.webInput]}
              />
            </View>
            <Text style={styles.note}>
              {scheduling
                ? "It goes on your calendar, with a reminder when it starts. Once it's done, mark it done and it goes into your journal."
                : "Saved straight to your journal. The minutes are the ones you set, so they show as logged, not tracked."}
            </Text>
          </>
        ) : (
          <Text style={styles.note}>
            {Platform.OS === "web"
              ? "Tap Start training and keep this page open. Each phase starts automatically, with a chime when it changes. To ride with your phone locked, use the Equina app."
              : "Tap Start training, then put your phone away. Each phase starts automatically, and you'll get a notification when it changes."}
          </Text>
        )}
        {problem ? <Text accessibilityRole="alert" style={styles.problem}>{problem}</Text> : null}
        {!problem && saveError ? <Text accessibilityRole="alert" style={styles.problem}>{saveError}</Text> : null}
        <EquinaButton
          testID={logging ? "add-activity-save" : "ride-setup-continue"}
          label={scheduling ? (saving ? "Scheduling..." : "Schedule") : logging ? (saving ? "Saving..." : "Save to journal") : "Start training"}
          disabled={Boolean(problem) || saving}
          onPress={() => void submit()}
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
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.compact,
    paddingTop: equinaTheme.spacing.xs
  },
  timeLabel: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary
  },
  noteInput: {
    minHeight: 76,
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
