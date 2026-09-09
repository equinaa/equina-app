import { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { BlurView } from "expo-blur";
import {
  Archive,
  Ban,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Flag,
  HelpCircle,
  Package,
  ShoppingBag,
  Trash2,
  X
} from "lucide-react-native";
import type { MarketplaceReportReason } from "../../backend";
import { ConversationComposer } from "../../ui/conversation/ConversationComposer";
import { ConversationMessage } from "../../ui/conversation/ConversationMessage";
import { ConversationState } from "../../ui/conversation/ConversationState";
import { warningHaptic } from "../../ui/motion/haptics";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { useReducedMotion } from "../../ui/motion/useReducedMotion";
import { equinaTheme } from "../../ui/theme/theme";
import type { ShopConversationController, ShopDisplayMessage } from "./useShopConversation";

type Sheet = "menu" | "report-account" | "report-message" | "block" | "archive" | "delete-message" | null;
const reportReasons: Array<{ value: MarketplaceReportReason; label: string }> = [
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Suspected scam" },
  { value: "other", label: "Something else" }
];

export function ShopConversationScreen({
  controller,
  fallbackListing,
  currentUserId,
  onBack,
  onViewListing,
  onProtectionHelp
}: {
  controller: ShopConversationController;
  fallbackListing?: { id: string; title: string; subtitle: string; photoUrl?: string };
  currentUserId?: string;
  onBack: () => void;
  onViewListing: () => void;
  onProtectionHelp: () => void;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selectedMessage, setSelectedMessage] = useState<ShopDisplayMessage | null>(null);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const reducedMotion = useReducedMotion();
  const thread = controller.activeThread;
  const listing = thread?.listing ?? fallbackListing;
  const listingSubtitle =
    listing && "subtitle" in listing && typeof listing.subtitle === "string"
      ? listing.subtitle
      : "";
  const participant = thread?.participant;

  useEffect(() => {
    setImageUnavailable(false);
  }, [listing?.photoUrl]);

  const send = async () => {
    await controller.send(controller.draft);
  };

  const closeSheet = () => {
    setSheet(null);
    setSelectedMessage(null);
  };

  const report = async (reason: MarketplaceReportReason) => {
    await controller.report({
      reason,
      listingId: listing?.id,
      messageId: sheet === "report-message" ? selectedMessage?.id : undefined,
      userId: participant?.id
    });
    closeSheet();
  };

  return (
    <KeyboardAvoidingView
      testID="shop-conversation"
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <MotionPressable
          testID="shop-route-back"
          accessibilityRole="button"
          accessibilityLabel="Back from messages"
          style={styles.iconButton}
          onPress={() => {
            controller.close();
            onBack();
          }}
        >
          <ChevronLeft size={21} color={equinaTheme.text.primary} />
        </MotionPressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{participant?.displayName.charAt(0).toUpperCase() || "E"}</Text>
        </View>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.name}>{participant?.displayName ?? "Messages"}</Text>
          <Text numberOfLines={1} style={styles.privacy}>Private marketplace conversation</Text>
        </View>
        <MotionPressable
          testID="shop-conversation-more"
          accessibilityRole="button"
          accessibilityLabel="Conversation options"
          disabled={!thread}
          style={[styles.iconButton, !thread && styles.disabled]}
          onPress={() => setSheet("menu")}
        >
          <Ellipsis size={21} color={equinaTheme.text.primary} />
        </MotionPressable>
      </View>

      {listing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${listing.title}`}
          style={styles.product}
          onPress={onViewListing}
        >
          <View style={styles.productImageFallback}>
            <Package size={16} color={equinaTheme.text.tertiary} />
            {listing.photoUrl && !imageUnavailable ? (
              <Image
                source={{ uri: listing.photoUrl }}
                style={styles.productImage}
                onError={() => setImageUnavailable(true)}
              />
            ) : null}
          </View>
          <View style={styles.productCopy}>
            <Text numberOfLines={1} style={styles.productTitle}>{listing.title}</Text>
            {listingSubtitle ? <Text numberOfLines={1} style={styles.productMeta}>{listingSubtitle}</Text> : null}
          </View>
          <ChevronRight size={17} color={equinaTheme.text.tertiary} />
        </Pressable>
      ) : null}

      {controller.error ? (
        <Text accessibilityRole="alert" style={styles.error}>{controller.error}</Text>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroller}
        contentContainerStyle={[
          styles.messages,
          controller.messages.length === 0 && styles.messagesEmpty
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: !reducedMotion })}
      >
        {controller.hasEarlier ? (
          <Pressable
            accessibilityRole="button"
            style={styles.loadEarlier}
            onPress={() => void controller.loadEarlier()}
          >
            <Text style={styles.loadEarlierText}>
              {controller.loadingEarlier ? "Loading..." : "Earlier messages"}
            </Text>
          </Pressable>
        ) : null}
        {controller.loading && controller.messages.length === 0 ? (
          <ConversationState loading title="Opening conversation..." />
        ) : !controller.connected ? (
          <ConversationState
            title="Messaging needs a connected account."
            body="Sign in with an eligible account to contact this seller securely."
          />
        ) : controller.messages.length === 0 ? (
          <ConversationState
            title="Start with one useful question."
            body="Ask about measurements, condition, shipping, or another photo."
          />
        ) : controller.messages.map((message) => {
          const own = message.senderId === currentUserId;
          return (
            <ConversationMessage
              key={message.id}
              own={own}
              body={message.body}
              status={message.clientStatus}
              onLongPress={() => {
                setSelectedMessage(message);
                setSheet(own ? "delete-message" : "report-message");
              }}
              onRetry={message.clientStatus === "failed" ? () => void controller.retry(message) : undefined}
            />
          );
        })}
      </ScrollView>

      <ConversationComposer
        testIDPrefix="shop-message"
        value={controller.draft}
        placeholder={controller.connected ? "Message seller" : "Messaging unavailable"}
        disabled={!controller.connected || !controller.activeConversationId}
        sending={controller.sending}
        onChangeText={controller.setDraft}
        onSend={() => void send()}
      />

      <ConversationSheet
        visible={sheet !== null}
        reducedMotion={reducedMotion}
        title={
          sheet === "report-account" || sheet === "report-message" ? "Choose a reason" :
          sheet === "block" ? "Block this account?" :
          sheet === "archive" ? "Archive conversation?" :
          sheet === "delete-message" ? "Delete your message?" :
          "Conversation"
        }
        onClose={closeSheet}
      >
        {sheet === "menu" ? (
          <>
            <SheetAction Icon={ShoppingBag} label="View listing" onPress={() => {
              closeSheet();
              onViewListing();
            }} />
            <SheetAction Icon={Archive} label="Archive" onPress={() => setSheet("archive")} />
            <SheetAction Icon={Flag} label="Report account" onPress={() => setSheet("report-account")} />
            <SheetAction Icon={Ban} label="Block account" destructive onPress={() => setSheet("block")} />
            <SheetAction Icon={HelpCircle} label="Buyer protection help" onPress={() => {
              closeSheet();
              onProtectionHelp();
            }} />
          </>
        ) : sheet === "report-account" || sheet === "report-message" ? (
          <View>
            <Text style={styles.explanation}>A report alerts Equina moderation. It does not automatically hide this account.</Text>
            {reportReasons.map((reason) => (
              <Pressable
                key={reason.value}
                accessibilityRole="button"
                style={styles.reason}
                onPress={() => void report(reason.value)}
              >
                <Text style={styles.reasonText}>{reason.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : sheet === "block" ? (
          <ConfirmCopy
            body="Blocking stops new messages between both accounts. You can unblock this rider later in Account."
            label="Block account"
            onConfirm={() => {
              if (!participant) return;
              warningHaptic();
              void controller.block(participant.id);
              closeSheet();
              onBack();
            }}
          />
        ) : sheet === "archive" ? (
          <ConfirmCopy
            body="This removes the conversation from your list only. The other participant keeps their copy."
            label="Archive"
            onConfirm={() => {
              void controller.archive();
              closeSheet();
              onBack();
            }}
          />
        ) : sheet === "delete-message" && selectedMessage ? (
          <ConfirmCopy
            body="This removes your message under Equina's marketplace retention policy."
            label="Delete message"
            onConfirm={() => {
              warningHaptic();
              void controller.deleteMessage(selectedMessage.id);
              closeSheet();
            }}
          />
        ) : null}
      </ConversationSheet>
    </KeyboardAvoidingView>
  );
}

function ConfirmCopy({
  body,
  label,
  onConfirm
}: {
  body: string;
  label: string;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.confirm}>
      <Text style={styles.explanation}>{body}</Text>
      <MotionPressable accessibilityRole="button" style={styles.dangerButton} onPress={onConfirm}>
        <Text style={styles.dangerButtonText}>{label}</Text>
      </MotionPressable>
    </View>
  );
}

function ConversationSheet({
  visible,
  reducedMotion,
  title,
  onClose,
  children
}: {
  visible: boolean;
  reducedMotion: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "slide"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable accessibilityViewIsModal style={styles.sheet} onPress={() => undefined}>
          {Platform.OS !== "web" ? (
            <BlurView
              pointerEvents="none"
              intensity={52}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
            />
          ) : null}
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.close} onPress={onClose}>
              <X size={19} color={equinaTheme.text.secondary} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetAction({
  Icon,
  label,
  destructive = false,
  onPress
}: {
  Icon: typeof Archive;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" style={styles.action} onPress={onPress}>
      <Icon size={18} color={destructive ? equinaTheme.colors.danger : equinaTheme.text.secondary} />
      <Text style={[styles.actionText, destructive && styles.actionDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.frame
  },
  header: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: equinaTheme.material.separator
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  disabled: {
    opacity: 0.35
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.surfaces.elevated
  },
  avatarText: {
    color: equinaTheme.text.primary,
    fontSize: 14,
    fontWeight: "600"
  },
  identity: {
    flex: 1,
    minWidth: 0
  },
  name: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600"
  },
  privacy: {
    color: equinaTheme.text.tertiary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    marginTop: 1
  },
  product: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: equinaTheme.surfaces.frame,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: equinaTheme.material.separator
  },
  productImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 42,
    height: 42,
    borderRadius: equinaTheme.radius.compact,
    backgroundColor: equinaTheme.surfaces.elevated
  },
  productImageFallback: {
    width: 42,
    height: 42,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.surfaces.elevated
  },
  productCopy: {
    flex: 1,
    minWidth: 0
  },
  productTitle: {
    color: equinaTheme.text.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600"
  },
  productMeta: {
    color: equinaTheme.text.tertiary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    marginTop: 1
  },
  error: {
    color: "#E2A5A6",
    backgroundColor: "rgba(157,43,46,0.15)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  scroller: {
    flex: 1
  },
  messages: {
    flexGrow: 1,
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24
  },
  messagesEmpty: {
    justifyContent: "center"
  },
  loadEarlier: {
    minHeight: 44,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  loadEarlierText: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    fontWeight: "600"
  },
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)"
  },
  sheet: {
    borderTopLeftRadius: equinaTheme.radius.sheet,
    borderTopRightRadius: equinaTheme.radius.sheet,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.glassStrong,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 30 : 20
  },
  sheetHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sheetTitle: {
    color: equinaTheme.text.primary,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600"
  },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  action: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  actionText: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    fontWeight: "400"
  },
  actionDanger: {
    color: "#E2A5A6"
  },
  explanation: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    marginBottom: 10
  },
  reason: {
    minHeight: 50,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(247,243,234,0.10)"
  },
  reasonText: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    fontWeight: "400"
  },
  confirm: {
    gap: 14
  },
  dangerButton: {
    minHeight: 56,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.danger
  },
  dangerButtonText: {
    color: equinaTheme.colors.ivory,
    fontSize: 15,
    fontWeight: "600"
  }
});
