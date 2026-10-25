import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { RideEntry } from "../../backend";
import { localDayOf, localMomentLabel, shortDayLabel } from "../../domain/local-day";
import { EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";
import { rideTrainingLabel } from "./ride-plan";

const moodLabel = { fresh: "Fresh", focused: "Focused", tender: "Tender" } as const;

// A ride the timer barely saw reads "<1 min", as it does on Home, not "0 min".
const durationOf = (entry: RideEntry) =>
  entry.elapsedSeconds < 60 ? "<1 min" : `${Math.round(entry.elapsedSeconds / 60)} min`;

/**
 * Every ride in the journal, one line each, newest first. A training logged
 * by hand says so. A wrong entry can be deleted here -- with Add activity a
 * typo is possible, and a journal you cannot correct is not a journal.
 */
export function RideJournalSheet({
  visible,
  entries,
  total,
  horseNames,
  deletingId,
  error,
  onDelete,
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
  onDismiss: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  // Shown in the row it belongs to. Offline, the journal refuses before
  // asking the server, and that refusal is the message.
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setConfirming(null);
    setDeleteError(null);
  }, [visible]);

  const oldest = entries[entries.length - 1];
  const oldestDay = oldest ? shortDayLabel(localDayOf(oldest.completedAt) ?? "") : null;

  return (
    <EquinaSheet visible={visible} title="Ride journal" onDismiss={onDismiss} closeTestID="ride-journal-close">
      <View style={styles.body} testID="ride-journal">
        {entries.length === 0 ? (
          <Text style={styles.empty}>No rides yet. A ride you finish or an activity you add appears here.</Text>
        ) : null}
        {entries.map((entry) => {
          const training = rideTrainingLabel(entry.trainingType)
            ?? `${entry.discipline.charAt(0).toUpperCase()}${entry.discipline.slice(1)}`;
          const horse = entry.horseId ? horseNames[entry.horseId] : undefined;
          const meta = [localMomentLabel(entry.completedAt), durationOf(entry), horse].filter(Boolean).join(" · ");
          const asking = confirming === entry.id;
          const deleting = deletingId === entry.id;
          return (
            <View key={entry.id} testID={`ride-journal-entry-${entry.id}`} style={styles.row}>
              <View style={styles.rowTop}>
                <View style={styles.rowCopy}>
                  <View style={styles.titleLine}>
                    <Text numberOfLines={1} style={styles.title}>{training}</Text>
                    {entry.source === "manual" ? <Text style={styles.tag}>Logged</Text> : null}
                  </View>
                  <Text numberOfLines={1} style={styles.meta}>{meta}</Text>
                  {entry.mood ? <Text style={styles.mood}>Felt {moodLabel[entry.mood].toLowerCase()}</Text> : null}
                </View>
                {!asking ? (
                  <MotionPressable
                    testID={`ride-journal-delete-${entry.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${training}, ${meta}`}
                    hitSlop={4}
                    disabled={Boolean(deletingId)}
                    onPress={() => {
                      selectionHaptic();
                      setConfirming(entry.id);
                    }}
                    style={styles.iconButton}
                  >
                    <Trash2 size={17} color={equinaTheme.text.secondary} />
                  </MotionPressable>
                ) : null}
              </View>
              {asking ? (
                <View style={styles.confirm}>
                  <Text style={styles.confirmText}>Delete this {entry.source === "manual" ? "activity" : "ride"}? It leaves your journal for good.</Text>
                  {deleteError?.id === entry.id ? (
                    <Text accessibilityRole="alert" style={styles.error}>{deleteError.message}</Text>
                  ) : null}
                  <View style={styles.confirmActions}>
                    <MotionPressable
                      testID={`ride-journal-keep-${entry.id}`}
                      accessibilityRole="button"
                      accessibilityLabel="Keep it"
                      disabled={deleting}
                      onPress={() => {
                        setConfirming(null);
                        setDeleteError(null);
                      }}
                      style={styles.confirmButton}
                    >
                      <Text style={styles.keepText}>Keep</Text>
                    </MotionPressable>
                    <MotionPressable
                      testID={`ride-journal-confirm-${entry.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${training}`}
                      disabled={deleting}
                      onPress={() => {
                        setDeleteError(null);
                        void onDelete(entry.id).then(
                          () => setConfirming(null),
                          (failure: unknown) => setDeleteError({
                            id: entry.id,
                            message: failure instanceof Error && failure.message ? failure.message : "The ride could not be deleted."
                          })
                        );
                      }}
                      style={[styles.confirmButton, styles.deleteButton]}
                    >
                      <Text style={styles.deleteText}>{deleting ? "Deleting..." : "Delete"}</Text>
                    </MotionPressable>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
        {error && !deleteError ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {total > entries.length && oldestDay ? (
          <Text style={styles.footnote}>
            Showing your rides since {oldestDay}. All {total} stay in your journal.
          </Text>
        ) : null}
      </View>
    </EquinaSheet>
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
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.material.quiet,
    paddingVertical: equinaTheme.spacing.compact,
    paddingLeft: equinaTheme.spacing.md,
    paddingRight: equinaTheme.spacing.sm,
    gap: equinaTheme.spacing.sm
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
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
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center"
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
