import { useEffect } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { Check, Plus } from "lucide-react-native";
import type { HorseRecord } from "../../backend";
import { EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { selectionHaptic } from "../../ui/motion/haptics";
import { equinaTheme } from "../../ui/theme/theme";

const disciplineLabel = (value?: HorseRecord["discipline"]) =>
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : undefined;

/**
 * The rider's horses, from the Home header. Picking one changes Home at once
 * and is kept as the main horse; the sheet stays open until that is saved,
 * so a pick that fails says so here instead of quietly springing back.
 */
export function HorseSwitcherSheet({
  visible,
  horses,
  selectedId,
  switchingId,
  error,
  onPick,
  onAdd,
  onDismiss
}: {
  visible: boolean;
  horses: readonly HorseRecord[];
  selectedId: string;
  /** The horse being saved as the main horse right now. */
  switchingId?: string;
  error?: string;
  onPick: (horseId: string) => void;
  /** Absent where the rider cannot add horses. */
  onAdd?: () => void;
  onDismiss: () => void;
}) {
  // Every photo starts downloading when the list opens, so the one picked is
  // already there when Home shows it.
  useEffect(() => {
    if (!visible) return;
    for (const horse of horses) {
      if (horse.photoUrl) void Image.prefetch(horse.photoUrl).catch(() => undefined);
    }
  }, [visible]);

  return (
    <EquinaSheet
      visible={visible}
      title="Your horses"
      onDismiss={switchingId ? () => undefined : onDismiss}
      closeTestID="horse-switcher-close"
    >
      <View style={styles.body} testID="horse-switcher">
        <View accessibilityRole="radiogroup" style={styles.list}>
          {horses.map((horse) => {
            const selected = horse.id === selectedId;
            const switching = horse.id === switchingId;
            const meta = [horse.breed, disciplineLabel(horse.discipline)].filter(Boolean).join(" · ");
            return (
              <MotionPressable
                key={horse.id}
                testID={`horse-switcher-${horse.id}`}
                accessibilityRole="radio"
                accessibilityLabel={horse.name}
                accessibilityState={{ selected, busy: switching }}
                disabled={Boolean(switchingId)}
                pressedScale={0.98}
                onPress={() => {
                  if (selected) {
                    onDismiss();
                    return;
                  }
                  selectionHaptic();
                  onPick(horse.id);
                }}
                style={[styles.row, selected && styles.rowSelected]}
              >
                {horse.photoUrl ? (
                  <Image source={{ uri: horse.photoUrl }} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.initial]}>
                    <Text style={styles.initialText}>{horse.name.trim().charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.name}>{horse.name}</Text>
                  {meta ? <Text numberOfLines={1} style={styles.meta}>{meta}</Text> : null}
                </View>
                {switching ? (
                  <ActivityIndicator color={equinaTheme.colors.brass} />
                ) : selected ? (
                  <Check size={20} color={equinaTheme.colors.brass} strokeWidth={2.4} />
                ) : null}
              </MotionPressable>
            );
          })}
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {onAdd ? (
          <MotionPressable
            testID="horse-switcher-add"
            accessibilityRole="button"
            accessibilityLabel="Add a horse"
            disabled={Boolean(switchingId)}
            onPress={() => {
              selectionHaptic();
              onAdd();
            }}
            style={styles.add}
          >
            <Plus size={18} color={equinaTheme.colors.brass} />
            <Text style={styles.addText}>Add a horse</Text>
          </MotionPressable>
        ) : null}
        <Text style={styles.note}>The horse you pick is the one Home, your rides and Ralf start from.</Text>
      </View>
    </EquinaSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: equinaTheme.spacing.md,
    paddingTop: equinaTheme.spacing.xs
  },
  list: {
    gap: equinaTheme.spacing.sm
  },
  row: {
    minHeight: 68,
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.material.quiet,
    paddingVertical: equinaTheme.spacing.sm,
    paddingLeft: equinaTheme.spacing.sm,
    paddingRight: equinaTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  rowSelected: {
    borderColor: equinaTheme.colors.brass,
    backgroundColor: equinaTheme.material.selected
  },
  photo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: equinaTheme.material.quietPressed
  },
  initial: {
    alignItems: "center",
    justifyContent: "center"
  },
  initialText: {
    ...equinaTheme.typography.body,
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  name: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  meta: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  error: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colorRole.criticalOnDark
  },
  add: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: equinaTheme.radius.control,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(196,160,90,0.55)",
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: equinaTheme.spacing.sm
  },
  addText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  note: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  }
});
