import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { equinaTheme } from "../theme/theme";

export function ConversationState({
  loading = false,
  title,
  body,
  action,
  onAction
}: {
  loading?: boolean;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.root}>
      {loading ? <ActivityIndicator color={equinaTheme.colors.brass} /> : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          style={styles.action}
          onPress={onAction}
        >
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 8
  },
  title: {
    color: equinaTheme.text.primary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    textAlign: "left"
  },
  body: {
    color: equinaTheme.text.secondary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "400",
    textAlign: "left"
  },
  action: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    marginTop: 6
  },
  actionText: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    fontWeight: "600"
  }
});
