import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { ArrowUp, Mic } from "lucide-react-native";
import { actionHaptic, selectionHaptic } from "../motion/haptics";
import { MotionPressable } from "../motion/MotionPressable";
import { equinaTheme } from "../theme/theme";

export function ConversationComposer({
  testIDPrefix,
  value,
  placeholder,
  disabled = false,
  sending = false,
  onChangeText,
  onSend,
  voice
}: {
  testIDPrefix: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  onChangeText: (value: string) => void;
  onSend: () => void;
  /**
   * Ask by voice (hold the mic, speak, let go): the words land in the box to
   * be read before sending. Absent, or not available on this phone: no mic.
   */
  voice?: {
    available: boolean;
    listening: boolean;
    hint: string;
    start: () => void;
    stop: () => void;
  };
}) {
  const [focused, setFocused] = useState(false);
  const canSend = !disabled && !sending && value.trim().length > 0;
  const submit = () => {
    if (!canSend) return;
    actionHaptic();
    onSend();
  };

  const listening = Boolean(voice?.listening);
  return (
    <View style={styles.dock}>
      {voice?.hint && !listening ? (
        <Text testID={`${testIDPrefix}-voice-hint`} accessibilityLiveRegion="polite" style={styles.hint}>{voice.hint}</Text>
      ) : null}
      <View style={[styles.composer, (focused || listening) && styles.composerFocused, listening && styles.composerListening]}>
        <TextInput
          testID={`${testIDPrefix}-input`}
          accessibilityLabel={placeholder}
          accessibilityState={{ disabled }}
          value={value}
          editable={!disabled}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          placeholder={listening ? "Listening..." : placeholder}
          placeholderTextColor={equinaTheme.text.tertiary}
          returnKeyType="send"
          multiline
          maxLength={2000}
          scrollEnabled
          style={[styles.input, Platform.OS === "web" ? styles.webInput : undefined]}
        />
        {voice?.available ? (
          <Pressable
            testID={`${testIDPrefix}-voice`}
            accessibilityRole="button"
            accessibilityLabel={listening ? "Listening. Let go to stop" : "Hold to ask by voice"}
            accessibilityState={{ disabled: disabled || sending, busy: listening }}
            disabled={disabled || sending}
            hitSlop={4}
            onPressIn={() => {
              selectionHaptic();
              voice.start();
            }}
            onPressOut={() => voice.stop()}
            style={[styles.send, listening && styles.micListening]}
          >
            <Mic size={19} strokeWidth={2.1} color={listening ? equinaTheme.colors.ink : equinaTheme.colors.brass} />
          </Pressable>
        ) : null}
        <MotionPressable
          testID={`${testIDPrefix}-send`}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend, busy: sending }}
          disabled={!canSend}
          pressedScale={0.94}
          style={[styles.send, canSend && styles.sendReady]}
          onPress={submit}
        >
          {sending ? (
            <ActivityIndicator size="small" color={equinaTheme.text.tertiary} />
          ) : (
            <ArrowUp
              size={19}
              strokeWidth={2.2}
              color={canSend ? equinaTheme.colors.ink : equinaTheme.text.tertiary}
            />
          )}
        </MotionPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "relative",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.surfaces.frame
  },
  composer: {
    minHeight: 52,
    maxHeight: 124,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.raised,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4
  },
  composerFocused: {
    backgroundColor: equinaTheme.surfaces.elevated
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 104,
    color: equinaTheme.text.primary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
    paddingTop: 11,
    paddingBottom: 9,
    paddingHorizontal: 0,
    textAlignVertical: "top"
  },
  webInput: {
    outlineStyle: "none"
  } as never,
  send: {
    width: 44,
    height: 44,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  sendReady: {
    backgroundColor: equinaTheme.colors.brass
  },
  composerListening: {
    borderWidth: 1,
    borderColor: equinaTheme.colors.brass
  },
  micListening: {
    backgroundColor: equinaTheme.colors.brass
  },
  hint: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    paddingHorizontal: 4,
    paddingBottom: 6
  }
});
