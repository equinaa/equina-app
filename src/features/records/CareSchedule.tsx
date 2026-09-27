import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarCheck, HeartPulse, Hammer, ShieldCheck, Stethoscope } from "lucide-react-native";
import type { CareItem, CareType, CareUrgency } from "../../domain/care-schedule";
import { careTypeLabels, describeDue, needsAttention } from "../../domain/care-schedule";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { equinaTheme } from "../../ui/theme/theme";

const careIcons: Record<CareType, typeof CalendarCheck> = {
  farrier: Hammer,
  vaccination: ShieldCheck,
  dental: HeartPulse,
  vet: Stethoscope,
  care: CalendarCheck
};

/**
 * Overdue is the only urgency that earns the critical colour. Something due
 * today is a plan, not a problem, and colouring it red teaches riders to
 * ignore red.
 */
const urgencyColor = (urgency: CareUrgency): string =>
  urgency === "overdue" ? equinaTheme.colorRole.critical : equinaTheme.colorRole.accent;

type CareRowProps = {
  item: CareItem;
  horseName?: string;
  showHorse: boolean;
  onLogDone?: (item: CareItem) => void;
  busy: boolean;
};

function CareRow({ item, horseName, showHorse, onLogDone, busy }: CareRowProps) {
  const Icon = careIcons[item.careType];
  const accent = urgencyColor(item.urgency);
  const label = careTypeLabels[item.careType];

  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { borderColor: accent }]}>
        <Icon size={18} color={accent} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {showHorse && horseName ? `${horseName} · ${label}` : label}
        </Text>
        <Text style={[styles.rowDue, { color: accent }]}>{describeDue(item)}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.record.title}
          {item.cadenceDays ? ` · every ${item.cadenceDays} days` : ""}
        </Text>
      </View>
      {onLogDone ? (
        <MotionPressable
          onPress={() => onLogDone(item)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Log ${label.toLowerCase()} as done${horseName ? ` for ${horseName}` : ""}`}
          style={[styles.doneButton, busy && styles.doneButtonBusy]}
        >
          <Text style={styles.doneLabel}>Log done</Text>
        </MotionPressable>
      ) : null}
    </View>
  );
}

export type CareScheduleProps = {
  schedule: readonly CareItem[];
  horseNames: Record<string, string>;
  /** A rider with one horse does not need to be told whose farrier this is. */
  showHorse: boolean;
  onLogDone?: (item: CareItem) => void;
  onAddDueDate?: () => void;
  busy?: boolean;
};

export function CareSchedule({
  schedule,
  horseNames,
  showHorse,
  onLogDone,
  onAddDueDate,
  busy = false
}: CareScheduleProps) {
  if (schedule.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Nothing scheduled</Text>
        <Text style={styles.emptyBody}>
          Add a due date to a farrier, vaccination, dental or vet record and it appears here, with the next one
          scheduled from the day it happened.
        </Text>
        {onAddDueDate ? (
          <Pressable onPress={onAddDueDate} accessibilityRole="button" style={styles.emptyAction}>
            <Text style={styles.emptyActionLabel}>Add a care record</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const attention = needsAttention(schedule);
  const later = schedule.filter((item) => item.urgency === "scheduled");

  return (
    <View style={styles.wrap}>
      {attention.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>Needs attention</Text>
          {attention.map((item) => (
            <CareRow
              key={item.record.id}
              item={item}
              horseName={horseNames[item.record.horseId]}
              showHorse={showHorse}
              onLogDone={onLogDone}
              busy={busy}
            />
          ))}
        </View>
      ) : null}

      {later.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>Scheduled</Text>
          {later.map((item) => (
            <CareRow
              key={item.record.id}
              item={item}
              horseName={horseNames[item.record.horseId]}
              showHorse={showHorse}
              onLogDone={onLogDone}
              busy={busy}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: equinaTheme.spacing.lg },
  group: { gap: equinaTheme.spacing.sm },
  groupLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: 1.1
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact,
    backgroundColor: equinaTheme.surfaces.raised,
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    padding: equinaTheme.spacing.compact
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: equinaTheme.radius.control,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  rowDue: { ...equinaTheme.typography.meta, fontWeight: "600" },
  rowMeta: { ...equinaTheme.typography.meta, color: equinaTheme.text.tertiary },
  doneButton: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    justifyContent: "center",
    paddingHorizontal: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet
  },
  doneButtonBusy: { opacity: 0.5 },
  doneLabel: { ...equinaTheme.typography.label, color: equinaTheme.text.primary },
  empty: {
    gap: equinaTheme.spacing.sm,
    backgroundColor: equinaTheme.surfaces.raised,
    borderRadius: equinaTheme.radius.card,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator,
    padding: equinaTheme.spacing.md
  },
  emptyTitle: { ...equinaTheme.typography.body, color: equinaTheme.text.primary, fontWeight: "600" },
  emptyBody: { ...equinaTheme.typography.meta, color: equinaTheme.text.secondary },
  emptyAction: {
    marginTop: equinaTheme.spacing.xs,
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    justifyContent: "center"
  },
  emptyActionLabel: { ...equinaTheme.typography.label, color: equinaTheme.colorRole.accent }
});
