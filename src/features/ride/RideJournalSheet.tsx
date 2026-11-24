import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react-native";
import type { RideEntry } from "../../backend";
import { localDayOf, localMomentLabel, shortDayLabel } from "../../domain/local-day";
import { EquinaButton, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { rideTrainingLabel } from "./ride-plan";
import { rideMinutesLabel } from "./ride-review-prompt";

const moodLabel = { fresh: "Fresh", focused: "Focused", tender: "Tender" } as const;

// A ride the timer barely saw reads "<1 min", as it does on Home, not "0 min".
const durationOf = (entry: RideEntry) => rideMinutesLabel(entry.elapsedSeconds);

const trainingOf = (entry: RideEntry) =>
  rideTrainingLabel(entry.trainingType)
    ?? `${entry.discipline.charAt(0).toUpperCase()}${entry.discipline.slice(1)}`;

/**
 * Every ride in the journal, one line each, newest first. A training logged
 * by hand says so. A row opens the ride: what was planned, what was ridden,
 * how the horse felt, and a way to ask Ralf about that ride. A wrong entry
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
  onAskRalf,
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
  /** Absent where Ralf is not available: the ride still opens, without the question. */
  onAskRalf?: (entry: RideEntry) => void;
  onDismiss: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Shown with the ride it belongs to. Offline, the journal refuses before
  // asking the server, and that refusal is the message.
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setOpenId(null);
    setConfirming(null);
    setDeleteError(null);
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
    >
      {open ? (
        <RideDetail
          entry={open}
          horse={open.horseId ? horseNames[open.horseId] : undefined}
          asking={confirming === open.id}
          deleting={deletingId === open.id}
          busy={Boolean(deletingId)}
          deleteError={deleteError?.id === open.id ? deleteError.message : undefined}
          error={error && !deleteError ? error : undefined}
          onBack={backToList}
          onAskRalf={onAskRalf}
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
                message: failure instanceof Error && failure.message ? failure.message : "The ride could not be deleted."
              })
            );
          }}
        />
      ) : (
        <View style={styles.body} testID="ride-journal">
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
 * One ride, in full. Deleting lives here and not on the row, so opening a
 * ride can never be mistaken for removing it; the question and its two
 * answers are the ones the row used to ask.
 */
function RideDetail({
  entry,
  horse,
  asking,
  deleting,
  busy,
  deleteError,
  error,
  onBack,
  onAskRalf,
  onAskDelete,
  onKeep,
  onConfirmDelete
}: {
  entry: RideEntry;
  /** Absent when the ride has no horse, or the horse is no longer the rider's. */
  horse?: string;
  asking: boolean;
  deleting: boolean;
  /** Any delete in flight, this ride's or another's. */
  busy: boolean;
  deleteError?: string;
  error?: string;
  onBack: () => void;
  onAskRalf?: (entry: RideEntry) => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onConfirmDelete: () => void;
}) {
  const training = trainingOf(entry);
  const manual = entry.source === "manual";
  const kind = manual ? "activity" : "ride";
  const when = localMomentLabel(entry.startedAt);
  const focus = entry.focus.trim();
  const phases = entry.phases ?? [];
  const facts: Array<[label: string, value: string | null | undefined]> = [
    ["When", when],
    ["Horse", horse],
    ["Training", training],
    // Minutes the rider typed are not minutes the clock counted, and say so.
    [manual ? "Time" : "Ride time", durationOf(entry)],
    ["Planned", manual ? undefined : entry.plannedDuration],
    ["Phases", entry.totalPhases > 0 ? `${entry.completedPhases} of ${entry.totalPhases}` : undefined],
    ["Felt", entry.mood ? moodLabel[entry.mood] : undefined],
    // Older rides keep a focus of their own; newer ones repeat the training.
    ["Worked on", focus && focus.toLowerCase() !== training.toLowerCase() ? focus : undefined],
    ["Recorded", manual ? "Added by hand" : "Timed live"]
  ];

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

      <View style={styles.card}>
        {facts.map(([label, value]) => value ? (
          <View key={label} accessible accessibilityLabel={`${label}: ${value}`} style={styles.fact}>
            <Text style={styles.factLabel}>{label}</Text>
            <Text style={styles.factValue}>{value}</Text>
          </View>
        ) : null)}
      </View>

      {phases.length > 0 ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionLabel}>Phases</Text>
          {phases.map((phase, index) => {
            const name = [phase.title, phase.detail].filter(Boolean).join(" · ");
            const planned = rideMinutesLabel(phase.plannedSeconds);
            const ridden = manual
              ? planned
              : phase.actualSeconds === undefined
                ? `${planned} planned, not reached`
                : `${planned} planned, ${rideMinutesLabel(phase.actualSeconds)} ridden`;
            return (
              <View
                key={`${index}-${phase.title}`}
                accessible
                accessibilityLabel={`${name}: ${ridden}`}
                style={styles.phase}
              >
                <Text style={styles.phaseName}>{name}</Text>
                <Text style={styles.meta}>{ridden}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {entry.riderNote ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionLabel}>Your note</Text>
          <Text style={styles.note}>{entry.riderNote}</Text>
        </View>
      ) : null}

      {onAskRalf ? (
        <View style={styles.ask}>
          <EquinaButton
            testID={`ride-journal-ask-ralf-${entry.id}`}
            label="Ask Ralf about this ride"
            onPress={() => onAskRalf(entry)}
          />
          <Text style={styles.askHint}>What went well, and the one thing to work on next time.</Text>
        </View>
      ) : null}

      {!asking ? (
        <MotionPressable
          testID={`ride-journal-delete-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${training}, ${[when, durationOf(entry), horse].filter(Boolean).join(" · ")}`}
          disabled={busy}
          onPress={onAskDelete}
          style={styles.deleteRow}
        >
          <Trash2 size={17} color={equinaTheme.text.secondary} />
          <Text style={styles.deleteRowText}>Delete {kind}</Text>
        </MotionPressable>
      ) : (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Delete this {kind}? It leaves your journal for good.</Text>
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
              accessibilityLabel={`Delete ${training}`}
              disabled={deleting}
              onPress={onConfirmDelete}
              style={[styles.confirmButton, styles.deleteButton]}
            >
              <Text style={styles.deleteText}>{deleting ? "Deleting..." : "Delete"}</Text>
            </MotionPressable>
          </View>
        </View>
      )}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
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
  phase: {
    gap: 2
  },
  phaseName: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  note: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary
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
  keepText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
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
