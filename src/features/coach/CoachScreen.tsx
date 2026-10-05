import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { BlurView } from "expo-blur";
import {
  Archive,
  ArrowUpRight,
  Check,
  ChevronLeft,
  Clock3,
  Copy,
  Ellipsis,
  MessageCirclePlus,
  Pencil,
  Settings2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X
} from "lucide-react-native";
import type { EquinaBackend } from "../../backend";
import { ConversationComposer } from "../../ui/conversation/ConversationComposer";
import { ConversationMessage } from "../../ui/conversation/ConversationMessage";
import { ConversationState } from "../../ui/conversation/ConversationState";
import { selectionHaptic, warningHaptic } from "../../ui/motion/haptics";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { useReducedMotion } from "../../ui/motion/useReducedMotion";
import { equinaTheme } from "../../ui/theme/theme";
import type { AccountMode } from "../account/account-types";
import type { CoachConversationContext, CoachDisplayMessage } from "./coach-types";
import { useCoachConversation, type CoachConversationController } from "./useCoachConversation";

type Sheet = "more" | "context" | "rename" | "message" | "delete" | null;

const defaultFocusOptions = ["Rhythm", "Flatwork", "Confidence", "Recovery"];
const loadOptions = ["Light week", "Normal week", "Heavy week"];
const styleOptions = ["Concise", "Step by step", "Reflective"];

/**
 * Ralf, opened from any tab. The conversation lives only while he is open;
 * coming back resumes the latest one, as the history is saved.
 */
export function RalfScreen({
  mode,
  backend,
  enabled,
  context,
  queuedPrompt,
  onQueuedPromptConsumed,
  suggestions,
  focusOptions,
  onBack,
  onContextChange
}: {
  mode: AccountMode;
  backend: EquinaBackend | null;
  enabled: boolean;
  context: CoachConversationContext;
  /** A question asked from elsewhere ("Ask Ralf about this lesson"), sent on open. */
  queuedPrompt: string;
  onQueuedPromptConsumed: () => void;
  suggestions: readonly string[];
  /** The rider's discipline's focuses, the same list as their training profile. */
  focusOptions?: readonly string[];
  onBack: () => void;
  onContextChange: (next: CoachConversationContext) => void;
}) {
  // A question from elsewhere starts its own conversation rather than landing
  // in the middle of whatever was open last.
  const opensWithQuestion = useRef(Boolean(queuedPrompt)).current;
  const controller = useCoachConversation({
    mode,
    backend,
    enabled,
    context,
    resumeLatest: !opensWithQuestion
  });

  useEffect(() => {
    if (!queuedPrompt) return;
    onQueuedPromptConsumed();
    void controller.send(queuedPrompt);
  }, [queuedPrompt]);

  return (
    <CoachScreen
      context={context}
      controller={controller}
      suggestions={suggestions}
      focusOptions={focusOptions}
      onBack={onBack}
      backLabel="Close Ralf"
      dismiss="close"
      onContextChange={onContextChange}
    />
  );
}

export function CoachScreen({
  context,
  controller,
  suggestions = [],
  focusOptions = defaultFocusOptions,
  onBack,
  backLabel = "Back",
  dismiss = "back",
  onContextChange
}: {
  context: CoachConversationContext;
  controller: CoachConversationController;
  /** Questions offered while the conversation is empty, so nobody starts from a blank page. */
  suggestions?: readonly string[];
  focusOptions?: readonly string[];
  onBack: () => void;
  backLabel?: string;
  /** "close" when Ralf sits over a tab rather than inside one. */
  dismiss?: "back" | "close";
  onContextChange: (next: CoachConversationContext) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selectedMessage, setSelectedMessage] = useState<CoachDisplayMessage | null>(null);
  const [contextDraft, setContextDraft] = useState(context);
  const [renameDraft, setRenameDraft] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setContextDraft(context);
  }, [context]);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const sent = await controller.send(body);
    if (!sent) setDraft(body);
  };

  const saveContext = async () => {
    onContextChange(contextDraft);
    await controller.updateContext(contextDraft);
    selectionHaptic();
    setSheet(null);
  };

  const openMessageActions = (message: CoachDisplayMessage) => {
    setSelectedMessage(message);
    setSheet("message");
  };

  const closeSheet = () => {
    setSheet(null);
    setSelectedMessage(null);
  };

  const deleteConversation = async () => {
    warningHaptic();
    await controller.deleteConversation();
    closeSheet();
  };

  return (
    <KeyboardAvoidingView
      testID="ralf-conversation"
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <MotionPressable
          testID="ai-chat-back"
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          style={styles.iconButton}
          onPress={onBack}
        >
          {dismiss === "close"
            ? <X size={21} color={equinaTheme.text.primary} />
            : <ChevronLeft size={21} color={equinaTheme.text.primary} />}
        </MotionPressable>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.name}>Ralf</Text>
          <Text numberOfLines={1} style={styles.context}>
            {context.hasHorse ? context.horseName : "Your riding"} · {context.focus}
          </Text>
        </View>
        {/* History is what riders come back for, so it sits in the header
            rather than behind the menu. */}
        <MotionPressable
          testID="ai-chat-history"
          accessibilityRole="button"
          accessibilityLabel="Ralf history"
          style={styles.iconButton}
          onPress={() => {
            controller.setHistoryOpen(true);
            void controller.loadHistory();
          }}
        >
          <Clock3 size={20} color={equinaTheme.text.primary} />
        </MotionPressable>
        <MotionPressable
          testID="ai-chat-more"
          accessibilityRole="button"
          accessibilityLabel="Ralf conversation options"
          style={styles.iconButton}
          onPress={() => setSheet("more")}
        >
          <Ellipsis size={21} color={equinaTheme.text.primary} />
        </MotionPressable>
      </View>

      {controller.error ? (
        <View accessibilityRole="alert" style={styles.errorLine}>
          <Text style={styles.errorText}>{controller.error}</Text>
        </View>
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
        {controller.loading && controller.messages.length === 0 ? (
          <ConversationState loading title="Opening your conversation..." />
        ) : controller.messages.length === 0 ? (
          <View style={styles.empty}>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {context.hasHorse ? `What does ${context.horseName} need today?` : "What does your next ride need?"}
            </Text>
            <Text style={styles.emptyBody}>
              Ask for a plan, a recap, or one training idea. Health concerns always go to your veterinarian.
            </Text>
            {suggestions.length > 0 && (controller.connected || controller.demo) ? (
              <View style={styles.suggestions}>
                {suggestions.map((suggestion, index) => (
                  <MotionPressable
                    key={suggestion}
                    testID={`ai-quick-prompt-${index + 1}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Ask Ralf: ${suggestion}`}
                    disabled={controller.sending}
                    style={styles.suggestion}
                    onPress={() => {
                      selectionHaptic();
                      void controller.send(suggestion);
                    }}
                  >
                    <Text numberOfLines={2} style={styles.suggestionText}>{suggestion}</Text>
                    <ArrowUpRight size={17} color={equinaTheme.colors.brass} />
                  </MotionPressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          controller.messages.map((message) => (
            <View key={message.id} style={styles.messageBlock}>
              <ConversationMessage
                own={message.role === "user"}
                body={message.text}
                status={message.status}
                author={message.role === "assistant" ? "Ralf" : undefined}
                variant={message.role === "assistant" ? "coach" : "default"}
                meta={message.role === "assistant" && message.confidence
                  ? `${message.confidence.charAt(0).toUpperCase()}${message.confidence.slice(1)} confidence`
                  : undefined}
                onLongPress={() => openMessageActions(message)}
                onRetry={message.status === "failed" ? () => void controller.retry(message) : undefined}
              />
              {message.role === "assistant" && message.safetyCategory === "health_escalation" ? (
                <Text style={styles.safetyNote}>For urgent or worsening signs, contact your veterinarian now.</Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <ConversationComposer
        testIDPrefix="ai-chat"
        value={draft}
        placeholder={context.hasHorse ? `Ask Ralf about ${context.horseName}` : "Ask Ralf about your next ride"}
        disabled={!controller.connected && !controller.demo}
        sending={controller.sending}
        onChangeText={setDraft}
        onSend={() => void submit()}
      />

      <CoachSheet
        visible={sheet !== null}
        reducedMotion={reducedMotion}
        title={
          sheet === "context" ? "This conversation" :
          sheet === "rename" ? "Rename conversation" :
          sheet === "message" ? "Message" :
          sheet === "delete" ? "Delete conversation?" :
          "Conversation"
        }
        onClose={closeSheet}
      >
        {sheet === "more" ? (
          <>
            <SheetAction Icon={MessageCirclePlus} label="New conversation" onPress={() => {
              controller.startNew();
              closeSheet();
            }} />
            <SheetAction Icon={Settings2} label="This conversation" onPress={() => setSheet("context")} />
            {controller.activeConversation ? (
                <SheetAction Icon={Pencil} label="Rename" onPress={() => {
                  setRenameDraft(controller.activeConversation?.title ?? "");
                  setSheet("rename");
                }} />
            ) : null}
            {controller.activeConversation || (controller.demo && controller.messages.length > 0) ? (
              <>
                <SheetAction Icon={Archive} label="Archive" onPress={() => {
                  void controller.archive();
                  closeSheet();
                }} />
                <SheetAction Icon={Trash2} label="Delete" destructive onPress={() => setSheet("delete")} />
              </>
            ) : null}
          </>
        ) : sheet === "context" ? (
          <ContextEditor
            value={contextDraft}
            focusOptions={focusOptions}
            onChange={setContextDraft}
            onSave={() => void saveContext()}
          />
        ) : sheet === "rename" ? (
          <View style={styles.rename}>
            <TextInput
              testID="ralf-rename-input"
              accessibilityLabel="Conversation title"
              autoFocus
              value={renameDraft}
              onChangeText={setRenameDraft}
              maxLength={80}
              placeholder="Conversation title"
              placeholderTextColor={equinaTheme.text.tertiary}
              style={[styles.renameInput, Platform.OS === "web" && styles.webInput]}
            />
            <MotionPressable
              testID="ralf-rename-save"
              accessibilityRole="button"
              disabled={!renameDraft.trim()}
              style={[styles.primary, !renameDraft.trim() && styles.disabled]}
              onPress={() => {
                void controller.rename(renameDraft);
                closeSheet();
              }}
            >
              <Text style={styles.primaryText}>Save</Text>
            </MotionPressable>
          </View>
        ) : sheet === "message" && selectedMessage ? (
          <>
            <SheetAction Icon={Copy} label="Copy" onPress={() => {
              void Clipboard.setStringAsync(selectedMessage.text);
              closeSheet();
            }} />
            {selectedMessage.role === "assistant" ? (
              <>
                <SheetAction Icon={ThumbsUp} label="Useful" onPress={() => {
                  void controller.feedback(selectedMessage.id, true);
                  closeSheet();
                }} />
                <SheetAction Icon={ThumbsDown} label="Not useful" onPress={() => {
                  void controller.feedback(selectedMessage.id, false);
                  closeSheet();
                }} />
                {selectedMessage.basedOn.length ? (
                  <View style={styles.basedOn}>
                    <Text style={styles.basedOnLabel}>BASED ON</Text>
                    <Text style={styles.basedOnText}>{selectedMessage.basedOn.join(" · ")}</Text>
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        ) : sheet === "delete" ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>This removes this conversation and its messages from your Ralf history.</Text>
            <MotionPressable
              testID="ralf-delete-confirm"
              accessibilityRole="button"
              style={styles.destructiveButton}
              onPress={() => void deleteConversation()}
            >
              <Text style={styles.destructiveText}>Delete conversation</Text>
            </MotionPressable>
          </View>
        ) : null}
      </CoachSheet>

      <HistorySheet
        visible={controller.historyOpen}
        reducedMotion={reducedMotion}
        controller={controller}
      />
    </KeyboardAvoidingView>
  );
}

function ContextEditor({
  value,
  focusOptions,
  onChange,
  onSave
}: {
  value: CoachConversationContext;
  focusOptions: readonly string[];
  onChange: (value: CoachConversationContext) => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.editor}>
      <Text style={styles.editorLead}>
        For this conversation only. Your usual focus is in Account, under Training profile.
      </Text>
      <View style={styles.contextHorse}>
        <Text style={styles.fieldLabel}>{value.hasHorse ? "Horse" : "Rider context"}</Text>
        <Text style={styles.contextHorseValue}>{value.hasHorse ? value.horseName : "No horse selected"}</Text>
      </View>
      <OptionRows
        label="Training focus"
        values={focusOptions.includes(value.focus) ? focusOptions : [...focusOptions, value.focus]}
        selected={value.focus}
        onSelect={(focus) => onChange({ ...value, focus })}
      />
      <OptionRows
        label="This week"
        values={loadOptions}
        selected={value.load}
        onSelect={(load) => onChange({ ...value, load })}
      />
      <OptionRows
        label="Response style"
        values={styleOptions}
        selected={value.style}
        onSelect={(style) => onChange({ ...value, style })}
      />
      <MotionPressable
        testID="ralf-context-save"
        accessibilityRole="button"
        style={styles.primary}
        onPress={onSave}
      >
        <Text style={styles.primaryText}>Use for this conversation</Text>
      </MotionPressable>
    </View>
  );
}

function OptionRows({
  label,
  values,
  selected,
  onSelect
}: {
  label: string;
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.optionGroup}>
        {values.map((value, index) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === value, selected: selected === value }}
            style={[
              styles.option,
              index < values.length - 1 && styles.optionDivider,
              selected === value && styles.optionSelected
            ]}
            onPress={() => onSelect(value)}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={[styles.optionText, selected === value && styles.optionTextSelected]}
            >
              {value}
            </Text>
            {selected === value ? <Check size={17} color={equinaTheme.colors.brass} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function HistorySheet({
  visible,
  reducedMotion,
  controller
}: {
  visible: boolean;
  reducedMotion: boolean;
  controller: CoachConversationController;
}) {
  return (
    <CoachSheet
      visible={visible}
      reducedMotion={reducedMotion}
      title="Ralf history"
      onClose={() => controller.setHistoryOpen(false)}
    >
      {controller.conversations.length === 0 ? (
        <Text style={styles.historyEmpty}>No saved conversations yet.</Text>
      ) : controller.conversations.map((conversation, index) => (
        <Pressable
          key={conversation.id}
          accessibilityRole="button"
          style={[styles.historyRow, index < controller.conversations.length - 1 && styles.optionDivider]}
          onPress={() => void controller.loadConversation(conversation.id)}
        >
          <View style={styles.historyCopy}>
            <Text numberOfLines={1} style={styles.historyTitle}>{conversation.title}</Text>
            <Text numberOfLines={1} style={styles.historyMeta}>
              {conversation.focus || "Training"} · {new Date(conversation.updatedAt).toLocaleDateString()}
            </Text>
          </View>
          {conversation.id === controller.activeConversationId ? (
            <Check size={17} color={equinaTheme.colors.brass} />
          ) : null}
        </Pressable>
      ))}
    </CoachSheet>
  );
}

function CoachSheet({
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={styles.sheetClose}
              onPress={onClose}
            >
              <X size={19} color={equinaTheme.text.secondary} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.sheetScroller}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
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
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.sheetAction} onPress={onPress}>
      <Icon size={18} color={destructive ? equinaTheme.colorRole.criticalOnDark : equinaTheme.text.secondary} />
      <Text style={[styles.sheetActionText, destructive && styles.sheetActionDestructive]}>{label}</Text>
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
    borderBottomColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.surfaces.frame
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
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
  context: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 1
  },
  errorLine: {
    backgroundColor: equinaTheme.material.quiet,
    paddingHorizontal: 16,
    paddingVertical: 9
  },
  errorText: {
    color: equinaTheme.colorRole.criticalOnDark,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400"
  },
  scroller: {
    flex: 1
  },
  messages: {
    flexGrow: 1,
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24
  },
  messagesEmpty: {
    justifyContent: "center"
  },
  empty: {
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 4
  },
  emptyTitle: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary
  },
  emptyBody: {
    color: equinaTheme.text.secondary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "400"
  },
  suggestions: {
    gap: 8,
    marginTop: 16
  },
  suggestion: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.raised
  },
  suggestionText: {
    flex: 1,
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400"
  },
  messageBlock: {
    gap: 6
  },
  safetyNote: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    paddingHorizontal: 4,
    maxWidth: "86%"
  },
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)"
  },
  sheet: {
    maxHeight: "84%",
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
  sheetScroller: {
    flexShrink: 1
  },
  sheetContent: {
    paddingBottom: 4
  },
  sheetTitle: {
    color: equinaTheme.text.primary,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600"
  },
  sheetClose: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  sheetAction: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  sheetActionText: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    fontWeight: "400"
  },
  sheetActionDestructive: {
    color: equinaTheme.colorRole.criticalOnDark
  },
  editor: {
    gap: 24
  },
  editorLead: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400"
  },
  fieldLabel: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    marginBottom: 8
  },
  contextHorse: {
    paddingVertical: 3
  },
  contextHorseValue: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    fontWeight: "600"
  },
  optionGroup: {
    borderRadius: equinaTheme.radius.control,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.elevated
  },
  option: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14
  },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: equinaTheme.material.separator
  },
  optionSelected: {
    backgroundColor: equinaTheme.material.quietPressed
  },
  optionText: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    fontWeight: "400",
    textAlign: "left"
  },
  optionTextSelected: {
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  primary: {
    minHeight: 56,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass,
    marginTop: 2
  },
  primaryText: {
    color: equinaTheme.colors.ink,
    fontSize: 15,
    fontWeight: "600"
  },
  disabled: {
    opacity: 0.42
  },
  rename: {
    gap: 14
  },
  renameInput: {
    minHeight: 52,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.elevated,
    color: equinaTheme.text.primary,
    fontSize: 16,
    fontWeight: "400",
    paddingHorizontal: 14
  },
  webInput: {
    outlineStyle: "none"
  } as never,
  basedOn: {
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: equinaTheme.material.separator
  },
  basedOnLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600"
  },
  basedOnText: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    marginTop: 5
  },
  confirm: {
    gap: 18
  },
  confirmText: {
    color: equinaTheme.text.secondary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "400"
  },
  destructiveButton: {
    minHeight: 56,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.danger
  },
  destructiveText: {
    color: equinaTheme.colors.ivory,
    fontSize: 15,
    fontWeight: "600"
  },
  historyEmpty: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    paddingVertical: 22
  },
  historyRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  historyCopy: {
    flex: 1,
    minWidth: 0
  },
  historyTitle: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  historyMeta: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 2
  }
});
