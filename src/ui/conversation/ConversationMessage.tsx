import { Pressable, StyleSheet, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { equinaTheme } from "../theme/theme";

export function ConversationMessage({
  own,
  body,
  status = "complete",
  meta,
  author,
  variant = "default",
  onLongPress,
  onRetry
}: {
  own: boolean;
  body: string;
  status?: "pending" | "complete" | "failed" | "blocked";
  meta?: string;
  author?: string;
  variant?: "default" | "coach";
  onLongPress?: () => void;
  onRetry?: () => void;
}) {
  const coachReply = variant === "coach" && !own;

  return (
    <View style={[styles.row, own && styles.rowOwn]}>
      {author ? <Text style={styles.author}>{author}</Text> : null}
      <Pressable
        accessibilityRole={onLongPress ? "button" : undefined}
        accessibilityHint={onLongPress ? "Hold for message actions" : undefined}
        onLongPress={onLongPress}
        delayLongPress={320}
        style={[
          styles.bubble,
          own ? styles.bubbleOwn : styles.bubbleOther,
          coachReply && styles.bubbleCoach
        ]}
      >
        <Text selectable style={[styles.body, coachReply && styles.bodyCoach, own && styles.bodyOwn]}>{body}</Text>
        {status === "pending" ? <Text style={styles.pending}>Sending...</Text> : null}
      </Pressable>
      {status === "failed" && onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry message"
          hitSlop={8}
          style={styles.retry}
          onPress={onRetry}
        >
          <RefreshCw size={14} color={equinaTheme.colorRole.criticalOnDark} />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
      {meta ? <Text style={[styles.meta, own && styles.metaOwn]}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "flex-start",
    gap: 4
  },
  rowOwn: {
    alignItems: "flex-end"
  },
  author: {
    color: equinaTheme.colors.brass,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    paddingHorizontal: 2
  },
  bubble: {
    minHeight: 44,
    maxWidth: "86%",
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  bubbleOwn: {
    maxWidth: "80%",
    backgroundColor: "rgba(196,160,90,0.14)",
    borderBottomRightRadius: equinaTheme.radius.compact
  },
  bubbleOther: {
    backgroundColor: equinaTheme.surfaces.raised,
    borderBottomLeftRadius: equinaTheme.radius.compact
  },
  bubbleCoach: {
    maxWidth: "94%",
    borderRadius: 0,
    paddingHorizontal: 2,
    paddingVertical: 0,
    backgroundColor: "transparent"
  },
  body: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "400"
  },
  bodyCoach: {
    fontSize: 16,
    lineHeight: 23
  },
  bodyOwn: {
    color: equinaTheme.text.primary
  },
  pending: {
    color: equinaTheme.text.tertiary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    marginTop: 5
  },
  retry: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 4
  },
  retryText: {
    color: equinaTheme.colorRole.criticalOnDark,
    fontSize: 12,
    fontWeight: "600"
  },
  // "Low confidence" changes how an answer should be read, so it is set at a
  // size and contrast people actually notice.
  meta: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    paddingHorizontal: 4
  },
  metaOwn: {
    textAlign: "right"
  }
});
