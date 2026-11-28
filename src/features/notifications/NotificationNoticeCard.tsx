import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Bell, X } from "lucide-react-native";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { equinaTheme } from "../../ui/theme/theme";
import type { TapNotice } from "./notification-routes";

/**
 * The notification the rider just tapped, in its own words, where the tap
 * landed: Notification Center no longer has it, and without this the screen
 * gave no clue why it opened. Stays until dismissed or the screen closes.
 */
export function NotificationNoticeCard({
  notice,
  onDismiss,
  testID,
  style
}: {
  notice: TapNotice;
  onDismiss: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  // "Training day: Jumping with Daimon is on your plan today."
  const said = notice.body ? `${notice.title}: ${notice.body}` : notice.title;
  return (
    <View style={[styles.card, style]} testID={testID}>
      <View style={styles.icon}>
        <Bell size={16} strokeWidth={2} color={equinaTheme.colors.brass} />
      </View>
      <View
        style={styles.copy}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`Notification. ${said}${notice.detail ? ` ${notice.detail}` : ""}`}
      >
        <Text style={styles.title}>{notice.title}</Text>
        {notice.body ? <Text style={styles.body}>{notice.body}</Text> : null}
        {notice.detail ? <Text style={styles.detail}>{notice.detail}</Text> : null}
      </View>
      <MotionPressable
        testID={testID ? `${testID}-dismiss` : undefined}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        hitSlop={10}
        onPress={onDismiss}
        style={styles.dismiss}
      >
        <X size={16} color={equinaTheme.text.secondary} />
      </MotionPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.control,
    borderWidth: 1,
    borderColor: "rgba(196,160,90,0.45)",
    backgroundColor: equinaTheme.surfaces.elevated,
    paddingLeft: equinaTheme.spacing.md,
    paddingRight: equinaTheme.spacing.sm,
    paddingVertical: equinaTheme.spacing.compact
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(196,160,90,0.12)"
  },
  copy: {
    flex: 1,
    gap: 2
  },
  title: {
    ...equinaTheme.typography.meta,
    fontWeight: "700",
    color: equinaTheme.text.primary
  },
  body: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  detail: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  dismiss: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center"
  }
});
