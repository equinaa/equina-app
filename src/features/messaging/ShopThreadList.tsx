import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, MessageCircle } from "lucide-react-native";
import { ConversationState } from "../../ui/conversation/ConversationState";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { equinaTheme } from "../../ui/theme/theme";
import type { ShopConversationController } from "./useShopConversation";

export function ShopThreadList({
  title,
  controller,
  onBack,
  onOpen
}: {
  title: string;
  controller: ShopConversationController;
  onBack: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <MotionPressable
          testID="shop-route-back"
          accessibilityRole="button"
          accessibilityLabel={`Back from ${title}`}
          style={styles.back}
          onPress={onBack}
        >
          <ChevronLeft size={21} color={equinaTheme.text.primary} />
        </MotionPressable>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <View style={styles.spacer} />
      </View>

      {controller.error ? (
        <Text accessibilityRole="alert" style={styles.error}>{controller.error}</Text>
      ) : null}

      {!controller.connected ? (
        <ConversationState
          title="Messages need a connected account."
          body="Buyer and seller conversations open after secure messaging is enabled for your verified account."
        />
      ) : controller.loading && controller.threads.length === 0 ? (
        <ConversationState loading title="Loading messages..." />
      ) : controller.threads.length === 0 ? (
        <ConversationState
          title="No conversations yet."
          body="Open an item and choose Message seller to start one."
          action="Retry"
          onAction={() => void controller.loadThreads()}
        />
      ) : (
        <View style={styles.list}>
          {controller.threads.map((thread, index) => (
            <Pressable
              key={thread.conversation.id}
              accessibilityRole="button"
              accessibilityLabel={`${thread.participant.displayName}, ${thread.listing.title}, ${thread.unreadCount} unread`}
              style={[styles.row, index < controller.threads.length - 1 && styles.divider]}
              onPress={() => {
                void controller.openThread(thread);
                onOpen();
              }}
            >
              {thread.listing.photoUrl ? (
                <Image source={{ uri: thread.listing.photoUrl }} style={styles.image} />
              ) : (
                <View style={styles.imageFallback}>
                  <MessageCircle size={18} color={equinaTheme.colors.brass} />
                </View>
              )}
              <View style={styles.copy}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>{thread.participant.displayName}</Text>
                  <Text style={styles.time}>
                    {new Date(thread.conversation.lastMessageAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.listing}>{thread.listing.title}</Text>
                <Text numberOfLines={1} style={styles.preview}>
                  {thread.lastMessage?.body ?? "Conversation opened"}
                </Text>
              </View>
              {thread.unreadCount > 0 ? (
                <View accessibilityLabel={`${thread.unreadCount} unread`} style={styles.unread}>
                  <Text style={styles.unreadText}>{Math.min(thread.unreadCount, 99)}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 520
  },
  header: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    flex: 1,
    color: equinaTheme.text.primary,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600",
    textAlign: "center"
  },
  spacer: {
    width: 44
  },
  error: {
    color: equinaTheme.colorRole.criticalOnDark,
    backgroundColor: "rgba(157,43,46,0.15)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  list: {
    paddingHorizontal: 14
  },
  row: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(247,243,234,0.10)"
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.elevated
  },
  imageFallback: {
    width: 56,
    height: 56,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.surfaces.elevated
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  name: {
    flex: 1,
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  time: {
    color: equinaTheme.text.tertiary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  listing: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    marginTop: 2
  },
  preview: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    marginTop: 2
  },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass,
    paddingHorizontal: 6
  },
  unreadText: {
    color: equinaTheme.colors.ink,
    fontSize: 11,
    fontWeight: "600"
  }
});
