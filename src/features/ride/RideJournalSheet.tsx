import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, StyleSheet, Text, TextInput, View, type ScrollView } from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react-native";
import type { PlannedActivity, RideEnd, RideEntry, RideMoodRecord } from "../../backend";
import { dayHeading } from "../../domain/activity-calendar";
import { disciplineLabel } from "../../domain/labels";
import { localDayOf, localMomentLabel, localToday, shortDayLabel } from "../../domain/local-day";
import { addDays, type PlanVersion, type TimeOffPeriod } from "../../domain/training-streak";
import { EquinaButton, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { RalfMedal } from "../coach/RalfMedal";
import { RideEffortCard } from "../health/RideEffortCard";
import { ralfMayUseEffort } from "../health/health-settings";
import { effortForRalf, RALF_EFFORT_CONSENT } from "../health/ride-effort";
import { useRideEffort, type AppleHealthController } from "../health/useAppleHealth";
import type { RideMood } from "./RideExperience";
import { CompareStrip, PhasesCard, RideStepper, RideWeekCard, TrendCard, moodWord, type TrendMetric } from "./RideContextCards";
import {
  compareRide,
  compareScopes,
  comparisonForRalf,
  dayLabel,
  lastRidesPhrase,
  nextSameWeekday,
  planAgainDays,
  repeatPlanOf,
  ridePeers,
  scheduledOn,
  scopeLabel,
  streakAround,
  weekAround,
  weekdayName,
  type CompareBaseline,
  type CompareScope,
  type CompareWords
} from "./ride-compare";
import { formatActivityTime, rideTrainingLabel } from "./ride-plan";
import { rideComparePrompt, rideEffortForRalf, rideMinutesLabel, rideReviewFactsFromEntry } from "./ride-review-prompt";

const moodLabel = { fresh: "Fresh", focused: "Focused", tender: "Tender" } as const;
const moods: readonly RideMoodRecord[] = ["fresh", "focused", "tender"];
// The journal saves feelings by the names the ride screens use.
const moodName: Record<RideMoodRecord, RideMood> = { fresh: "Fresh", focused: "Focused", tender: "Tender" };

// A ride the timer barely saw reads "<1 min", as it does on Home, not "0 min".
const durationOf = (entry: RideEntry) => rideMinutesLabel(entry.elapsedSeconds);

const trainingOf = (entry: RideEntry) =>
  rideTrainingLabel(entry.trainingType)
    ?? disciplineLabel(entry.discipline);

const messageOf = (failure: unknown, fallback: string) =>
  failure instanceof Error && failure.message ? failure.message : fallback;

/** A feeling or a note, changed in place. */
export type RideUpdate = { mood?: RideMood; riderNote?: string };

/** What the week and the streak of a past ride are read from: the training plan's own data. */
export type RideJournalTraining = {
  versions: readonly PlanVersion[];
  timeOff: readonly TimeOffPeriod[];
  completions: readonly RideEnd[];
};

/**
 * Every ride in the journal, one line each, newest first. A training logged
 * by hand says so. A row opens the ride in context: the same training on the
 * same horse before and after it, how it compares, the week it was in, and a
 * way to ride it again, plan it again or ask Ralf what changed. A wrong entry
 * can be deleted from there -- with Add activity a typo is possible, and a
 * journal you cannot correct is not a journal.
 */
export function RideJournalSheet({
  visible,
  entries,
  total,
  horseNames,
  deletingId,
  error,
  onDelete,
  onUpdate,
  onAskRalf,
  onRepeat,
  onPlanAgain,
  planHorseFor,
  onOpenDay,
  rideActive = false,
  planned = [],
  training,
  appleHealth,
  onManageHealth,
  minimalContext = false,
  onDismiss
}: {
  visible: boolean;
  entries: readonly RideEntry[];
  /** Every ride saved, which can be more than the ones loaded. */
  total: number;
  horseNames: Record<string, string>;
  /** The entry being deleted right now, if any. */
  deletingId?: string;
  error?: string;
  onDelete: (id: string) => Promise<void>;
  /** Saves a feeling or a note in place. Absent: the ride is read only. */
  onUpdate?: (id: string, patch: RideUpdate) => Promise<unknown>;
  /**
   * Absent where Ralf is not available: the ride still opens, without the
   * question. With a prompt, the question is the comparison the screen built.
   * With an effort line, the rider allowed their heart rate to go with it:
   * it travels beside the question, never inside it, so nothing Equina keeps
   * holds it (rideEffortForRalf).
   */
  onAskRalf?: (entry: RideEntry, prompt?: string, effort?: string) => void;
  /** Opens the ride setup filled in with this ride. */
  onRepeat?: (entry: RideEntry) => void;
  /** Opens Add activity on a day ahead, filled in with this ride. */
  onPlanAgain?: (entry: RideEntry, day: string) => void;
  /** The horse Plan it again schedules for, so the chips check that horse's days. */
  planHorseFor?: (entry: RideEntry) => string | undefined;
  /** Opens the calendar on a day. */
  onOpenDay?: (day: string) => void;
  /** A ride is under way: another cannot be set up or planned over it. */
  rideActive?: boolean;
  /** The activities scheduled ahead, so a day already planned says so. */
  planned?: readonly PlannedActivity[];
  /** The training plan, once read: the week and streak a ride belonged to. */
  training?: RideJournalTraining;
  /** Apple Health on this iPhone: the rider's effort on each ride. Absent where there is none. */
  appleHealth?: AppleHealthController;
  /** Opens Account › Privacy and Ralf, where the effort settings are. */
  onManageHealth?: () => void;
  /** Account's Minimal context: Ralf then gets the ride's facts and nothing of the rider's heart rate. */
  minimalContext?: boolean;
  onDismiss: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Shown with the ride it belongs to. Offline, the journal refuses before
  // asking the server, and that refusal is the message.
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  // Kept while the rider steps from ride to ride; nothing here is saved.
  const [scope, setScope] = useState<CompareScope>("horse+training");
  const [baseline, setBaseline] = useState<CompareBaseline>("average");
  const [metric, setMetric] = useState<TrendMetric>("minutes");
  const scrollRef = useRef<ScrollView>(null);
  // Where the list was when a ride opened. The list comes back at its top
  // (a ride opens at its own), so it is put back there: a rider going
  // through older rides one by one does not scroll down to them each time.
  const listOffset = useRef(0);
  const returning = useRef(false);

  useEffect(() => {
    listOffset.current = 0;
    returning.current = false;
    if (!visible) return;
    setOpenId(null);
    setConfirming(null);
    setDeleteError(null);
    setScope("horse+training");
    setBaseline("average");
    setMetric("minutes");
  }, [visible]);

  const oldest = entries[entries.length - 1];
  const oldestDay = oldest ? shortDayLabel(localDayOf(oldest.completedAt) ?? "") : null;
  // A ride that is gone (deleted here or elsewhere) has no detail: the list shows.
  const open = openId ? entries.find((entry) => entry.id === openId) : undefined;

  const backToList = () => {
    setOpenId(null);
    setConfirming(null);
    setDeleteError(null);
  };

  return (
    <EquinaSheet
      visible={visible}
      title={open ? trainingOf(open) : "Ride journal"}
      onDismiss={onDismiss}
      closeTestID="ride-journal-close"
      contentKey={open ? open.id : "list"}
      scrollRef={scrollRef}
      onScroll={(event) => {
        // A ride scrolls on its own: only the list's place is kept.
        if (!open && !returning.current) listOffset.current = event.nativeEvent.contentOffset.y;
      }}
    >
      {open ? (
        <RideDetail
          entry={open}
          entries={entries}
          horseNames={horseNames}
          since={total > entries.length && oldestDay ? oldestDay : undefined}
          scope={scope}
          baseline={baseline}
          metric={metric}
          rideActive={rideActive}
          planned={planned}
          training={training}
          appleHealth={appleHealth}
          onManageHealth={onManageHealth}
          minimalContext={minimalContext}
          asking={confirming === open.id}
          deleting={deletingId === open.id}
          busy={Boolean(deletingId)}
          deleteError={deleteError?.id === open.id ? deleteError.message : undefined}
          error={error && !deleteError ? error : undefined}
          onBack={backToList}
          onOpen={(entry) => {
            setOpenId(entry.id);
            setConfirming(null);
            setDeleteError(null);
          }}
          onScope={setScope}
          onBaseline={setBaseline}
          onMetric={setMetric}
          onUpdate={onUpdate}
          onAskRalf={onAskRalf}
          onRepeat={onRepeat}
          onPlanAgain={onPlanAgain}
          planHorseFor={planHorseFor}
          onOpenDay={onOpenDay}
          onAskDelete={() => {
            selectionHaptic();
            setConfirming(open.id);
          }}
          onKeep={() => {
            setConfirming(null);
            setDeleteError(null);
          }}
          onConfirmDelete={() => {
            setDeleteError(null);
            void onDelete(open.id).then(
              backToList,
              (failure: unknown) => setDeleteError({
                id: open.id,
                message: messageOf(failure, "The ride could not be deleted.")
              })
            );
          }}
        />
      ) : (
        <View
          style={styles.body}
          testID="ride-journal"
          onLayout={() => {
            // Laid out again after a ride closed (back, deleted, or gone).
            if (!returning.current) return;
            returning.current = false;
            scrollRef.current?.scrollTo({ y: listOffset.current, animated: false });
          }}
        >
          {entries.length === 0 ? (
            <Text style={styles.empty}>No rides yet. A ride you finish or an activity you add appears here.</Text>
          ) : null}
          {entries.map((entry) => {
            const training = trainingOf(entry);
            const horse = entry.horseId ? horseNames[entry.horseId] : undefined;
            // When it started, as the rider enters it in Add activity and as a
            // yard thinks of a ride: "the 12:45 hack", not when it ended.
            const meta = [localMomentLabel(entry.startedAt), durationOf(entry), horse].filter(Boolean).join(" · ");
            // The row is one button now, so its label carries what the tag
            // and the feeling line show.
            const spoken = [
              `Open ${training}`,
              meta,
              entry.source === "manual" ? "logged by hand" : null,
              entry.mood ? `felt ${moodLabel[entry.mood].toLowerCase()}` : null
            ].filter(Boolean).join(", ");
            return (
              <MotionPressable
                key={entry.id}
                testID={`ride-journal-entry-${entry.id}`}
                accessibilityRole="button"
                accessibilityLabel={spoken}
                onPress={() => {
                  selectionHaptic();
                  returning.current = true;
                  setOpenId(entry.id);
                }}
                style={styles.row}
              >
                <View style={styles.rowCopy}>
                  <View style={styles.titleLine}>
                    <Text numberOfLines={1} style={styles.title}>{training}</Text>
                    {entry.source === "manual" ? <Text style={styles.tag}>Logged</Text> : null}
                  </View>
                  <Text numberOfLines={1} style={styles.meta}>{meta}</Text>
                  {entry.mood ? <Text style={styles.mood}>Felt {moodLabel[entry.mood].toLowerCase()}</Text> : null}
                </View>
                <ChevronRight size={18} color={equinaTheme.text.tertiary} />
              </MotionPressable>
            );
          })}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {total > entries.length && oldestDay ? (
            <Text style={styles.footnote}>
              Showing your rides since {oldestDay}. All {total} stay in your journal.
            </Text>
          ) : null}
        </View>
      )}
    </EquinaSheet>
  );
}

/**
 * One ride, in context. Deleting lives here and not on the row, so opening
 * a ride can never be mistaken for removing it; the question and its two
 * answers are the ones the row used to ask. Every insight ends in something
 * to do: ride it again, plan it again, or ask Ralf what changed.
 */
function RideDetail({
  entry,
  entries,
  horseNames,
  since,
  scope,
  baseline,
  metric,
  rideActive,
  planned,
  training,
  appleHealth,
  onManageHealth,
  minimalContext,
  asking,
  deleting,
  busy,
  deleteError,
  error,
  onBack,
  onOpen,
  onScope,
  onBaseline,
  onMetric,
  onUpdate,
  onAskRalf,
  onRepeat,
  onPlanAgain,
  planHorseFor,
  onOpenDay,
  onAskDelete,
  onKeep,
  onConfirmDelete
}: {
  entry: RideEntry;
  entries: readonly RideEntry[];
  horseNames: Record<string, string>;
  since?: string;
  scope: CompareScope;
  baseline: CompareBaseline;
  metric: TrendMetric;
  rideActive: boolean;
  planned: readonly PlannedActivity[];
  training?: RideJournalTraining;
  appleHealth?: AppleHealthController;
  onManageHealth?: () => void;
  minimalContext: boolean;
  asking: boolean;
  deleting: boolean;
  /** Any delete in flight, this ride's or another's. */
  busy: boolean;
  deleteError?: string;
  error?: string;
  onBack: () => void;
  onOpen: (entry: RideEntry) => void;
  onScope: (scope: CompareScope) => void;
  onBaseline: (baseline: CompareBaseline) => void;
  onMetric: (metric: TrendMetric) => void;
  onUpdate?: (id: string, patch: RideUpdate) => Promise<unknown>;
  onAskRalf?: (entry: RideEntry, prompt?: string, effort?: string) => void;
  onRepeat?: (entry: RideEntry) => void;
  onPlanAgain?: (entry: RideEntry, day: string) => void;
  /** The horse Plan it again schedules for, so the chips check that horse's days. */
  planHorseFor?: (entry: RideEntry) => string | undefined;
  onOpenDay?: (day: string) => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onConfirmDelete: () => void;
}) {
  const today = localToday();
  const trainingWord = trainingOf(entry);
  const manual = entry.source === "manual";
  const kind = manual ? "activity" : "ride";
  const when = localMomentLabel(entry.startedAt);
  const focus = entry.focus.trim();
  // Absent when the ride has no horse, or the horse is no longer the rider's.
  const horse = entry.horseId ? horseNames[entry.horseId] : undefined;
  const words: CompareWords = { training: trainingWord, ...(horse ? { horse } : {}) };
  // A ride from before the setup sheet has no training to compare by; one
  // without a horse has no horse to widen or narrow to.
  const scopes: readonly CompareScope[] = !entry.trainingType ? [] : horse ? compareScopes : ["horse+training"];
  const shownScope: CompareScope = scopes.includes(scope) ? scope : "horse+training";
  const peers = entry.trainingType ? ridePeers(entries, entry, shownScope) : [];
  const comparison = entry.trainingType ? compareRide(entry, peers, baseline, { scope: shownScope, words }) : null;
  const week = weekAround(entry, entries, { today, ...(training ? { plan: training.versions, timeOff: training.timeOff, completions: training.completions } : {}) });
  const streak = training ? streakAround(entry, training, today) : null;

  const repeat = repeatPlanOf(entry);
  const repeatMinutes = repeat.phases?.reduce((sum, phase) => sum + phase.minutes, 0);
  const sameRide = scopeLabel("horse+training", words);
  const repeatCaption = repeat.phases
    ? `${sameRide} · ${repeat.phases.length} ${repeat.phases.length === 1 ? "phase" : "phases"} · ${repeatMinutes} min. Opens ready to start.`
    : `${sameRide}. Opens ready to start.`;
  const planDays = planAgainDays(entry, entry.trainingType ? ridePeers(entries, entry) : [], today);
  const time = formatActivityTime(repeat.startMinutes);

  // Saved in place. A feeling shows the moment it is tapped and goes back if
  // the save fails; clearing one is not offered, the journal only sets them.
  const [pendingMood, setPendingMood] = useState<RideMoodRecord | null>(null);
  const shownMood = pendingMood ?? entry.mood;
  const [saveError, setSaveError] = useState<{ where: "mood" | "note"; message: string } | null>(null);
  const [details, setDetails] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(entry.riderNote ?? "");
  const [savingNote, setSavingNote] = useState(false);

  const pickMood = async (mood: RideMoodRecord) => {
    if (!onUpdate || pendingMood || mood === entry.mood) return;
    selectionHaptic();
    setPendingMood(mood);
    setSaveError(null);
    try {
      await onUpdate(entry.id, { mood: moodName[mood] });
      AccessibilityInfo.announceForAccessibility("Saved");
    } catch (failure) {
      setSaveError({ where: "mood", message: messageOf(failure, "The feeling could not be saved.") });
    } finally {
      setPendingMood(null);
    }
  };

  const saveNote = async () => {
    if (!onUpdate || savingNote) return;
    const next = noteDraft.trim();
    if (next === (entry.riderNote ?? "").trim()) {
      setEditingNote(false);
      return;
    }
    setSavingNote(true);
    setSaveError(null);
    try {
      await onUpdate(entry.id, { riderNote: next });
      setEditingNote(false);
      AccessibilityInfo.announceForAccessibility("Saved");
    } catch (failure) {
      setSaveError({ where: "note", message: messageOf(failure, "The note could not be saved.") });
    } finally {
      setSavingNote(false);
    }
  };

  // The rider's heart rate and calories from Apple Health, read as the ride
  // opens and kept in memory only.
  const effort = useRideEffort(entry, appleHealth);
  const effortShown = effort.view.kind === "ready" || effort.view.kind === "reading" ? effort.view.effort : undefined;
  const effortLine = effortShown && appleHealth && !minimalContext
    ? effortForRalf(effortShown, { phases: entry.phases, placement: effort.placement })
    : null;
  const effortForRalfNow = Boolean(effortLine && appleHealth && ralfMayUseEffort(appleHealth.settings, minimalContext));

  // The heart rate goes to Ralf only after a yes, asked the first time it
  // would: Ralf's replies are written by an AI provider, who would receive it.
  // The answer is kept on this phone; Account changes it later. The line is
  // handed on beside the question, so the question shown and kept in Ralf's
  // history never holds it.
  const withEffort = (send: (line?: string) => void) => {
    if (!effortLine || !appleHealth) return send();
    if (appleHealth.settings.ralfEffort === "allowed") return send(effortLine);
    if (appleHealth.settings.ralfEffort === "declined") return send();
    Alert.alert(
      RALF_EFFORT_CONSENT.title,
      RALF_EFFORT_CONSENT.message,
      [
        {
          text: RALF_EFFORT_CONSENT.notNow,
          style: "cancel",
          onPress: () => {
            appleHealth.update({ ralfEffort: "declined" });
            send();
          }
        },
        {
          text: RALF_EFFORT_CONSENT.allow,
          onPress: () => {
            appleHealth.update({ ralfEffort: "allowed" });
            send(effortLine);
          }
        }
      ],
      { cancelable: false }
    );
  };

  // Ralf is asked about the difference, with the peers in the message: he
  // reads only the newest rides on his own, without their phases.
  const compared = comparison && comparison.baseline.length > 0 && comparison.averageMinutes !== null ? comparison : null;
  const nextRide = lastRidesPhrase(shownScope, words, 1).replace(/^your last /, "");
  // The plain review is the one App writes itself, with or without the heart rate.
  const askPlain = () => {
    if (!onAskRalf) return;
    withEffort((line) => onAskRalf(entry, undefined, rideEffortForRalf(line)));
  };
  const askAbout = (question: string) => {
    if (!onAskRalf) return;
    if (!compared) {
      askPlain();
      return;
    }
    withEffort((line) =>
      onAskRalf(
        entry,
        rideComparePrompt(rideReviewFactsFromEntry(entry, horse), comparisonForRalf(compared, shownScope, words), question),
        rideEffortForRalf(line)
      )
    );
  };
  const ralfGets = compared
    ? `Ralf gets this ride and ${lastRidesPhrase(shownScope, words, compared.baseline.length)}${effortForRalfNow ? ", with your heart rate and calories" : ""}.`
    : "";
  const difference = compared && compared.averageMinutes !== null ? compared.minutes - compared.averageMinutes : 0;
  // The question is about this ride's own weekday, the one it is usually ridden on.
  const rideDay = localDayOf(entry.startedAt);
  const nextDay = rideDay ? nextSameWeekday(rideDay, today) : undefined;
  const questions = [
    difference > 0 ? "Why was this one longer?" : difference < 0 ? "Why was this one shorter?" : null,
    nextDay ? `What should ${weekdayName(nextDay)} look like?` : null
  ].filter((question): question is string => Boolean(question));
  const closingFor = (chip: string) =>
    nextDay && chip === `What should ${weekdayName(nextDay)} look like?`
      ? `What should my ${nextRide} on ${dayHeading(nextDay)} look like?`
      : chip;

  const detailFacts: Array<[label: string, value: string | null | undefined]> = [
    ["Horse", horse],
    ["Training", trainingWord],
    ["Planned", manual ? undefined : entry.plannedDuration],
    // Older rides keep a focus of their own; newer ones repeat the training.
    ["Worked on", focus && focus.toLowerCase() !== trainingWord.toLowerCase() ? focus : undefined],
    ["Recorded", manual ? "Added by hand" : "Timed live"]
  ];
  const heroWords = [
    when,
    `${durationOf(entry)} ${manual ? "logged" : "timed"}`,
    comparison?.sentence?.replace(/−/g, "minus "),
    entry.totalPhases > 0 ? `${entry.completedPhases} of ${entry.totalPhases} phases` : null,
    manual ? "added by hand" : "timed live"
  ].filter(Boolean).join(", ");
  const feelAbout = horse ?? "your horse";

  return (
    <View style={styles.body} testID={`ride-journal-detail-${entry.id}`}>
      <MotionPressable
        testID="ride-journal-back"
        accessibilityRole="button"
        accessibilityLabel="Back to all rides"
        onPress={onBack}
        style={styles.back}
      >
        <ChevronLeft size={18} color={equinaTheme.text.secondary} />
        <Text style={styles.backText}>All rides</Text>
      </MotionPressable>

      {scopes.length > 0 && (peers.length > 1 || scopes.length > 1) ? (
        <RideStepper
          entry={entry}
          peers={peers}
          scope={shownScope}
          scopes={scopes}
          words={words}
          onStep={onOpen}
          onScope={onScope}
        />
      ) : null}

      <View style={styles.card} testID="ride-journal-hero">
        <View accessible accessibilityLabel={heroWords} style={styles.heroFacts}>
          {when ? <Text style={styles.meta}>{when}</Text> : null}
          <View style={styles.heroLine}>
            <Text style={styles.heroMinutes}>{durationOf(entry)}</Text>
            <Text style={styles.tag}>{manual ? "Logged" : "Timed"}</Text>
          </View>
          {comparison?.sentence ? <Text style={styles.heroDelta}>{comparison.sentence}</Text> : null}
          {/* How it was recorded is the tag beside the minutes; the Details row spells it out. */}
          {entry.totalPhases > 0 ? (
            <View style={styles.pills}>
              <Text style={styles.pill}>{entry.completedPhases} of {entry.totalPhases} phases</Text>
            </View>
          ) : null}
        </View>

        {onUpdate ? (
          <View style={styles.feeling}>
            <Text style={styles.sectionLabel}>{shownMood ? `How ${feelAbout} felt` : `How did ${feelAbout} feel?`}</Text>
            <View accessibilityRole="radiogroup" style={styles.chips}>
              {moods.map((mood) => {
                const selected = mood === shownMood;
                return (
                  <MotionPressable
                    key={mood}
                    testID={`ride-journal-mood-${mood}`}
                    accessibilityRole="radio"
                    accessibilityLabel={moodWord[mood]}
                    accessibilityState={{ selected, disabled: Boolean(pendingMood) }}
                    pressedScale={0.97}
                    disabled={Boolean(pendingMood)}
                    onPress={() => void pickMood(mood)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{moodWord[mood]}</Text>
                  </MotionPressable>
                );
              })}
            </View>
            {saveError?.where === "mood" ? <Text accessibilityRole="alert" style={styles.error}>{saveError.message}</Text> : null}
          </View>
        ) : entry.mood ? (
          <Text style={styles.meta}>Felt {moodLabel[entry.mood].toLowerCase()}</Text>
        ) : null}

        <MotionPressable
          testID="ride-journal-details"
          accessibilityRole="button"
          accessibilityLabel="Details"
          accessibilityState={{ expanded: details }}
          onPress={() => {
            selectionHaptic();
            setDetails((open) => !open);
          }}
          style={styles.detailsToggle}
        >
          <Text style={styles.backText}>Details</Text>
          <View style={details ? styles.flipped : undefined}>
            <ChevronDown size={16} color={equinaTheme.text.secondary} />
          </View>
        </MotionPressable>
        {details ? detailFacts.map(([label, value]) => value ? (
          <View key={label} accessible accessibilityLabel={`${label}: ${value}`} style={styles.fact}>
            <Text style={styles.factLabel}>{label}</Text>
            <Text style={styles.factValue}>{value}</Text>
          </View>
        ) : null) : null}
      </View>

      {!entry.trainingType ? (
        <Text style={styles.footnote}>This ride is from before ride setup, so it isn't compared with others.</Text>
      ) : null}

      {comparison ? (
        <CompareStrip
          entry={entry}
          comparison={comparison}
          scope={shownScope}
          words={words}
          since={since}
          onBaseline={onBaseline}
        />
      ) : null}

      {peers.length >= 2 ? (
        <TrendCard
          entry={entry}
          peers={peers}
          usualMinutes={comparison?.averageMinutes ?? null}
          metric={metric}
          scope={shownScope}
          words={words}
          onMetric={onMetric}
          onOpen={onOpen}
        />
      ) : null}

      <PhasesCard entry={entry} comparison={comparison} />

      {appleHealth ? <RideEffortCard entry={entry} effort={effort} horse={horse} onManage={onManageHealth} /> : null}

      {week ? <RideWeekCard week={week} streak={streak} horse={horse} onOpenDay={onOpenDay} /> : null}

      {onRepeat ? (
        <View style={styles.ask}>
          <EquinaButton
            testID={`ride-journal-repeat-${entry.id}`}
            label={rideActive ? "A ride is in progress" : "Repeat this ride"}
            disabled={rideActive}
            onPress={() => onRepeat(entry)}
          />
          <Text style={styles.askHint}>{repeatCaption}</Text>
        </View>
      ) : null}

      {onPlanAgain && !rideActive ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionLabel}>Plan it again</Text>
          <View style={styles.chips}>
            {planDays.map((day) => {
              const taken = scheduledOn(planned, day, planHorseFor ? planHorseFor(entry) : entry.horseId);
              return (
                <MotionPressable
                  key={day}
                  testID={`ride-journal-plan-${day}`}
                  accessibilityRole="button"
                  accessibilityLabel={taken ? `Already planned on ${dayHeading(day)}` : `Plan it again on ${dayHeading(day)} at ${time}`}
                  accessibilityState={{ disabled: taken }}
                  disabled={taken}
                  pressedScale={0.97}
                  onPress={() => {
                    selectionHaptic();
                    onPlanAgain(entry, day);
                  }}
                  style={[styles.chip, taken && styles.chipTaken]}
                >
                  <Text style={[styles.chipText, taken && styles.chipTextTaken]}>
                    {taken ? `Planned ${dayLabel(day)}` : `${dayLabel(day)} · ${time}`}
                  </Text>
                </MotionPressable>
              );
            })}
            <MotionPressable
              testID="ride-journal-plan-pick"
              accessibilityRole="button"
              accessibilityLabel="Plan it again on a day you pick"
              pressedScale={0.97}
              onPress={() => {
                selectionHaptic();
                onPlanAgain(entry, addDays(today, 1));
              }}
              style={styles.chip}
            >
              <Text style={styles.chipText}>Pick a day…</Text>
            </MotionPressable>
          </View>
        </View>
      ) : null}

      {onAskRalf ? compared ? (
        <View style={styles.card} testID="ride-journal-ralf">
          <MotionPressable
            testID={`ride-journal-ask-ralf-${entry.id}`}
            accessibilityRole="button"
            accessibilityLabel="Ask Ralf what changed"
            accessibilityHint={ralfGets}
            onPress={() => askAbout(`What changed, and what should my next ${nextRide} look like?`)}
            style={styles.ralfRow}
          >
            <RalfMedal size={36} ring={equinaTheme.surfaces.raised} />
            <View style={styles.ralfCopy}>
              <Text style={styles.title}>Ask Ralf what changed</Text>
              <Text style={styles.meta}>{ralfGets}</Text>
            </View>
            <ChevronRight size={18} color={equinaTheme.text.tertiary} />
          </MotionPressable>
          {questions.length ? (
            <View style={styles.chips}>
              {questions.map((question) => (
                <MotionPressable
                  key={question}
                  testID={`ride-journal-ralf-question-${questions.indexOf(question)}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask Ralf: ${question}`}
                  pressedScale={0.97}
                  onPress={() => askAbout(closingFor(question))}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{question}</Text>
                </MotionPressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.ask}>
          <EquinaButton
            testID={`ride-journal-ask-ralf-${entry.id}`}
            label="Ask Ralf about this ride"
            variant="secondary"
            onPress={askPlain}
          />
          <Text style={styles.askHint}>
            {effortForRalfNow
              ? "What went well, and the one thing to work on next time. Ralf gets your heart rate and calories too."
              : "What went well, and the one thing to work on next time."}
          </Text>
        </View>
      ) : null}

      {editingNote ? (
        <View style={styles.card} testID="ride-journal-note-editor">
          <Text accessibilityRole="header" style={styles.sectionLabel}>Your note</Text>
          <TextInput
            testID="ride-journal-note-input"
            accessibilityLabel="Your note"
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder="What worked, what to try next time"
            placeholderTextColor={equinaTheme.text.tertiary}
            selectionColor={equinaTheme.colors.brass}
            maxLength={2000}
            multiline
            autoFocus
            editable={!savingNote}
            style={[styles.noteInput, styles.webInput]}
          />
          {saveError?.where === "note" ? <Text accessibilityRole="alert" style={styles.error}>{saveError.message}</Text> : null}
          <View style={styles.confirmActions}>
            <MotionPressable
              testID="ride-journal-note-cancel"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              disabled={savingNote}
              onPress={() => {
                setEditingNote(false);
                setNoteDraft(entry.riderNote ?? "");
                setSaveError(null);
              }}
              style={styles.confirmButton}
            >
              <Text style={styles.keepText}>Cancel</Text>
            </MotionPressable>
            <MotionPressable
              testID="ride-journal-note-done"
              accessibilityRole="button"
              accessibilityLabel="Save the note"
              disabled={savingNote}
              onPress={() => void saveNote()}
              style={[styles.confirmButton, styles.doneButton]}
            >
              <Text style={styles.doneText}>{savingNote ? "Saving..." : "Done"}</Text>
            </MotionPressable>
          </View>
        </View>
      ) : entry.riderNote ? (
        <View style={styles.card}>
          <View style={styles.noteTop}>
            <Text accessibilityRole="header" style={styles.sectionLabel}>Your note</Text>
            {onUpdate ? (
              <MotionPressable
                testID="ride-journal-note-edit"
                accessibilityRole="button"
                accessibilityLabel="Edit your note"
                onPress={() => {
                  selectionHaptic();
                  setNoteDraft(entry.riderNote ?? "");
                  setEditingNote(true);
                }}
                style={styles.noteEdit}
              >
                <Pencil size={16} color={equinaTheme.text.secondary} />
              </MotionPressable>
            ) : null}
          </View>
          <Text style={styles.note}>{entry.riderNote}</Text>
        </View>
      ) : onUpdate ? (
        <MotionPressable
          testID="ride-journal-note-add"
          accessibilityRole="button"
          accessibilityLabel="Add a note"
          onPress={() => {
            selectionHaptic();
            setNoteDraft("");
            setEditingNote(true);
          }}
          style={styles.addNote}
        >
          <Plus size={17} color={equinaTheme.colors.brass} />
          <Text style={styles.addNoteText}>Add a note</Text>
        </MotionPressable>
      ) : null}

      {!asking ? (
        <MotionPressable
          testID={`ride-journal-delete-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${kind}, ${trainingWord}, ${[when, durationOf(entry), horse].filter(Boolean).join(" · ")}`}
          disabled={busy}
          onPress={onAskDelete}
          style={styles.deleteRow}
        >
          <Trash2 size={17} color={equinaTheme.text.secondary} />
          <Text style={styles.deleteRowText}>Delete {kind}</Text>
        </MotionPressable>
      ) : (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            {`Delete this ${kind}? It leaves your journal for good.${appleHealth && !manual ? " Any copy in Apple Health stays there." : ""}`}
          </Text>
          {deleteError ? <Text accessibilityRole="alert" style={styles.error}>{deleteError}</Text> : null}
          <View style={styles.confirmActions}>
            <MotionPressable
              testID={`ride-journal-keep-${entry.id}`}
              accessibilityRole="button"
              accessibilityLabel="Keep it"
              disabled={deleting}
              onPress={onKeep}
              style={styles.confirmButton}
            >
              <Text style={styles.keepText}>Keep</Text>
            </MotionPressable>
            <MotionPressable
              testID={`ride-journal-confirm-${entry.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${trainingWord}`}
              disabled={deleting}
              onPress={onConfirmDelete}
              style={[styles.confirmButton, styles.deleteButton]}
            >
              <Text style={styles.deleteText}>{deleting ? "Deleting..." : "Delete"}</Text>
            </MotionPressable>
          </View>
        </View>
      )}
      {/* A failed feeling or note says so where it was tapped, not twice. */}
      {error && !saveError ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: equinaTheme.spacing.sm,
    paddingTop: equinaTheme.spacing.xs
  },
  empty: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm,
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.material.quiet,
    paddingVertical: equinaTheme.spacing.compact,
    paddingLeft: equinaTheme.spacing.md,
    paddingRight: equinaTheme.spacing.compact
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  title: {
    ...equinaTheme.typography.body,
    flexShrink: 1,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  tag: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass,
    borderWidth: 1,
    borderColor: "rgba(196,160,90,0.55)",
    borderRadius: equinaTheme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
    overflow: "hidden"
  },
  meta: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  mood: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  },
  back: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: equinaTheme.spacing.xs,
    paddingRight: equinaTheme.spacing.md
  },
  backText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    fontWeight: "600"
  },
  card: {
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.material.quiet,
    paddingVertical: equinaTheme.spacing.compact,
    paddingHorizontal: equinaTheme.spacing.md,
    gap: equinaTheme.spacing.sm
  },
  heroFacts: {
    gap: equinaTheme.spacing.xs
  },
  heroLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: equinaTheme.spacing.sm
  },
  heroMinutes: {
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary,
    fontVariant: ["tabular-nums"]
  },
  heroDelta: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: equinaTheme.spacing.sm,
    paddingTop: equinaTheme.spacing.xs
  },
  pill: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    borderRadius: equinaTheme.radius.pill,
    backgroundColor: equinaTheme.material.quietPressed,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
    fontVariant: ["tabular-nums"]
  },
  feeling: {
    gap: equinaTheme.spacing.sm,
    paddingTop: equinaTheme.spacing.xs
  },
  section: {
    gap: equinaTheme.spacing.sm,
    paddingTop: equinaTheme.spacing.xs
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: equinaTheme.spacing.sm
  },
  chip: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
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
  chipTaken: {
    borderStyle: "dashed",
    borderColor: equinaTheme.material.separator
  },
  chipText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  chipTextSelected: {
    color: equinaTheme.colors.brass
  },
  chipTextTaken: {
    color: equinaTheme.text.tertiary
  },
  detailsToggle: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: equinaTheme.spacing.xs,
    paddingRight: equinaTheme.spacing.md,
    marginBottom: -equinaTheme.spacing.xs
  },
  flipped: {
    transform: [{ rotate: "180deg" }]
  },
  fact: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.md
  },
  factLabel: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  factValue: {
    ...equinaTheme.typography.meta,
    flex: 1,
    textAlign: "right",
    color: equinaTheme.text.primary,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  sectionLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  note: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary
  },
  noteTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: -equinaTheme.spacing.sm
  },
  noteEdit: {
    width: equinaTheme.accessibility.minimumTapTarget,
    height: equinaTheme.accessibility.minimumTapTarget,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -equinaTheme.spacing.compact
  },
  noteInput: {
    minHeight: 96,
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
  webInput: {
    outlineStyle: "none"
  } as never,
  addNote: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm,
    paddingHorizontal: equinaTheme.spacing.md,
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(196,160,90,0.55)"
  },
  addNoteText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  ask: {
    gap: equinaTheme.spacing.sm,
    paddingTop: equinaTheme.spacing.xs
  },
  askHint: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary,
    textAlign: "center"
  },
  ralfRow: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  ralfCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  deleteRow: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: equinaTheme.spacing.sm,
    paddingHorizontal: equinaTheme.spacing.md
  },
  deleteRowText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    fontWeight: "600"
  },
  confirm: {
    gap: equinaTheme.spacing.sm
  },
  confirmText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: equinaTheme.spacing.sm
  },
  confirmButton: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    paddingHorizontal: equinaTheme.spacing.md,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quietPressed
  },
  deleteButton: {
    backgroundColor: "rgba(214,92,76,0.18)"
  },
  doneButton: {
    backgroundColor: equinaTheme.material.selected
  },
  keepText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  doneText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  deleteText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colorRole.criticalOnDark,
    fontWeight: "600"
  },
  error: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colorRole.criticalOnDark
  },
  footnote: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  }
});
