import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { ArrowUp } from "lucide-react-native";
import { actionHaptic } from "../motion/haptics";
import { MotionPressable } from "../motion/MotionPressable";
import { equinaTheme } from "../theme/theme";

export function ConversationComposer({
  testIDPrefix,
  value,
  placeholder,
  disabled = false,
  sending = false,
  onChangeText,
  onSend
}: {
  testIDPrefix: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  onChangeText: (value: string) => void;
  onSend: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const canSend = !disabled && !sending && value.trim().length > 0;
  const submit = () => {
    if (!canSend) return;
    actionHaptic();
    onSend();
  };

  return (
    <View style={styles.dock}>
      <View style={[styles.composer, focused && styles.composerFocused]}>
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
          placeholder={placeholder}
          placeholderTextColor={equinaTheme.text.tertiary}
          returnKeyType="send"
          multiline
          maxLength={2000}
          scrollEnabled
          style={[styles.input, Platform.OS === "web" ? styles.webInput : undefined]}
        />
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
  }
});
