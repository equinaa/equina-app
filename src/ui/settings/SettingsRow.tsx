import type { ComponentType } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { ChevronRight } from "lucide-react-native";
import { equinaTheme } from "../theme/theme";

type SettingsIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export function SettingsRow({
  Icon,
  title,
  detail,
  value,
  destructive = false,
  disabled = false,
  switchValue,
  testID,
  onPress,
  onToggle,
  style
}: {
  Icon?: SettingsIcon;
  title: string;
  detail?: string;
  value?: string;
  destructive?: boolean;
  disabled?: boolean;
  switchValue?: boolean;
  testID?: string;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <>
      {Icon ? <Icon size={19} strokeWidth={1.7} color={destructive ? equinaTheme.colorRole.criticalOnDark : equinaTheme.text.secondary} /> : null}
      <View style={styles.copy}>
        <Text style={[styles.title, destructive && styles.destructive, disabled && styles.disabled]}>{title}</Text>
        {detail ? <Text style={[styles.detail, disabled && styles.disabled]}>{detail}</Text> : null}
      </View>
      {switchValue !== undefined ? (
        <View pointerEvents="none" accessible={false} style={styles.switchVisual}>
          <Switch
            accessible={false}
            disabled={disabled}
            value={switchValue}
            trackColor={{ false: equinaTheme.surfaces.elevated, true: equinaTheme.colorRole.positive }}
            thumbColor={equinaTheme.colors.ivory}
            ios_backgroundColor={equinaTheme.surfaces.elevated}
          />
        </View>
      ) : (
        <>
          {value ? <Text numberOfLines={1} style={[styles.value, disabled && styles.disabled]}>{value}</Text> : null}
          {onPress && !disabled ? <ChevronRight size={17} color={equinaTheme.text.tertiary} /> : null}
        </>
      )}
    </>
  );

  if (switchValue !== undefined) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityHint={detail}
        accessibilityState={{ checked: switchValue, disabled }}
        disabled={disabled || !onToggle}
        onPress={() => onToggle?.(!switchValue)}
        style={({ pressed }) => [styles.row, style, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      accessibilityState={{ disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, style, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  pressed: {
    backgroundColor: equinaTheme.material.quietPressed
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400"
  },
  detail: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    marginTop: 2
  },
  value: {
    maxWidth: 130,
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400"
  },
  switchVisual: {
    width: 44,
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "center"
  },
  destructive: {
    color: equinaTheme.colorRole.criticalOnDark
  },
  disabled: {
    opacity: 0.45
  }
});
