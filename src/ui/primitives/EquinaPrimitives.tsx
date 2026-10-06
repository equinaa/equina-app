import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle
} from "react-native";
import { BlurView } from "expo-blur";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { MotionPressable } from "../motion/MotionPressable";
import { selectionHaptic } from "../motion/haptics";
import { useReducedMotion } from "../motion/useReducedMotion";
import { equinaTheme } from "../theme/theme";

type EquinaButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  testID?: string;
  style?: StyleProp<ViewStyle>;
  leading?: ReactNode;
  showArrow?: boolean;
};

type EquinaIconButtonProps = {
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  onPress: () => void;
  testID?: string;
  tone?: "ghost" | "glass" | "accent";
  iconColor?: string;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export function EquinaIconButton({
  Icon,
  label,
  onPress,
  testID,
  tone = "ghost",
  iconColor,
  iconSize = 20,
  style,
  disabled = false
}: EquinaIconButtonProps) {
  const resolvedColor = iconColor ?? (tone === "accent" ? equinaTheme.colors.ink : equinaTheme.text.primary);

  return (
    <MotionPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        primitiveStyles.iconButton,
        tone === "glass" && primitiveStyles.iconButtonGlass,
        tone === "accent" && primitiveStyles.iconButtonAccent,
        disabled && primitiveStyles.iconButtonDisabled,
        style
      ]}
    >
      <Icon size={iconSize} strokeWidth={1.9} color={resolvedColor} />
    </MotionPressable>
  );
}

export function EquinaButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
  testID,
  style,
  leading,
  showArrow = true
}: EquinaButtonProps) {
  return (
    <MotionPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        primitiveStyles.button,
        variant === "primary" ? primitiveStyles.buttonPrimary : primitiveStyles.buttonSecondary,
        disabled && primitiveStyles.buttonDisabled,
        style
      ]}
    >
      {leading}
      <Text
        numberOfLines={2}
        style={[
          primitiveStyles.buttonText,
          variant === "secondary" && primitiveStyles.buttonTextSecondary,
          disabled && primitiveStyles.buttonTextDisabled
        ]}
      >
        {label}
      </Text>
      {showArrow && (
        <ChevronRight
          size={18}
          strokeWidth={2.2}
          color={
            disabled
              ? equinaTheme.text.tertiary
              : variant === "primary"
                ? equinaTheme.colors.ink
                : equinaTheme.text.primary
          }
        />
      )}
    </MotionPressable>
  );
}

export function EquinaBackButton({ onPress, testID }: { onPress: () => void; testID?: string }) {
  return (
    <EquinaIconButton
      Icon={ChevronLeft}
      testID={testID}
      label="Go back"
      onPress={onPress}
      iconSize={22}
    />
  );
}

type EquinaSheetProps = {
  visible: boolean;
  title: string;
  children: ReactNode;
  onDismiss: () => void;
  closeTestID?: string;
};

export function EquinaSheet({ visible, title, children, onDismiss, closeTestID }: EquinaSheetProps) {
  const sheetMotion = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!visible) {
      sheetMotion.setValue(0);
      return;
    }

    if (reducedMotion) {
      sheetMotion.setValue(1);
      return;
    }

    Animated.spring(sheetMotion, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.72,
      useNativeDriver: Platform.OS !== "web"
    }).start();
  }, [reducedMotion, sheetMotion, visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={primitiveStyles.sheetRoot}
      >
        <Pressable accessibilityElementsHidden importantForAccessibility="no" onPress={onDismiss} style={primitiveStyles.sheetBackdrop} />
        <Animated.View
          accessibilityViewIsModal
          style={[
            primitiveStyles.sheet,
            {
              opacity: sheetMotion,
              transform: [
                {
                  translateY: sheetMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [reducedMotion ? 0 : 48, 0]
                  })
                }
              ]
            }
          ]}
        >
          <BlurView
            pointerEvents="none"
            intensity={56}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
          />
          <View style={primitiveStyles.sheetHeader}>
            <Text accessibilityRole="header" numberOfLines={2} style={primitiveStyles.sheetTitle}>{title}</Text>
            <MotionPressable
              testID={closeTestID}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onDismiss}
              style={primitiveStyles.sheetClose}
            >
              <X size={20} color={equinaTheme.text.primary} />
            </MotionPressable>
          </View>
          <ScrollView
            style={primitiveStyles.sheetScroll}
            contentContainerStyle={primitiveStyles.sheetContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type EquinaFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  optional?: boolean;
};

export function EquinaField({ label, optional = false, ...inputProps }: EquinaFieldProps) {
  const [focused, setFocused] = useState(false);
  const { onBlur, onFocus, ...restInputProps } = inputProps;

  return (
    <View style={primitiveStyles.field}>
      <View style={primitiveStyles.fieldLabelRow}>
        <Text style={primitiveStyles.label}>{label}</Text>
        {optional && <Text style={primitiveStyles.optional}>Optional</Text>}
      </View>
      <TextInput
        {...restInputProps}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        placeholderTextColor={equinaTheme.text.tertiary}
        selectionColor={equinaTheme.colors.brass}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[primitiveStyles.input, focused && primitiveStyles.inputFocused, primitiveStyles.webInput]}
      />
    </View>
  );
}

type EquinaSelectorProps<T extends string> = {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  testPrefix: string;
};

export function EquinaSelector<T extends string>({
  label,
  options,
  value,
  onChange,
  testPrefix
}: EquinaSelectorProps<T>) {
  return (
    <View style={primitiveStyles.selectorBlock}>
      <Text style={primitiveStyles.label}>{label}</Text>
      <View accessibilityRole="radiogroup" style={primitiveStyles.selector}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <MotionPressable
              key={option}
              testID={`${testPrefix}-${option.toLowerCase().replaceAll(" ", "-")}`}
              accessibilityRole="radio"
              accessibilityLabel={option}
              accessibilityState={{ selected }}
              pressedScale={0.97}
              onPress={() => {
                if (!selected) selectionHaptic();
                onChange(option);
              }}
              style={[
                primitiveStyles.selectorItem,
                option.length >= 10 && primitiveStyles.selectorItemWide,
                option.length <= 3 && primitiveStyles.selectorItemCompact,
                selected && primitiveStyles.selectorItemSelected
              ]}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.86}
                style={[primitiveStyles.selectorText, selected && primitiveStyles.selectorTextSelected]}
              >
                {option}
              </Text>
            </MotionPressable>
          );
        })}
      </View>
    </View>
  );
}

type EquinaSegmentedTabsProps<T extends string> = {
  tabs: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Each tab gets `${testIDPrefix}-${label in lower case}`. */
  testIDPrefix: string;
  style?: StyleProp<ViewStyle>;
};

/** A row of equal tabs that switch one view: the Stable's Overview/Care/Documents, the Club's Feed/Groups. */
export function EquinaSegmentedTabs<T extends string>({ tabs, value, onChange, testIDPrefix, style }: EquinaSegmentedTabsProps<T>) {
  return (
    <View accessibilityRole="tablist" style={[primitiveStyles.segmentedTabs, style]}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            testID={`${testIDPrefix}-${tab.label.toLowerCase()}`}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            style={[primitiveStyles.segmentedTab, active && primitiveStyles.segmentedTabActive]}
            onPress={() => onChange(tab.value)}
          >
            <Text numberOfLines={1} style={[primitiveStyles.segmentedTabText, active && primitiveStyles.segmentedTabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EquinaProgress({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Onboarding: ${label}`}
      accessibilityValue={{ min: 1, max: total, now: current }}
      style={primitiveStyles.progressRow}
    >
      <Text style={primitiveStyles.progressLabel}>{label}</Text>
      <View style={primitiveStyles.progressTracks}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[primitiveStyles.progressTrack, index < current && primitiveStyles.progressTrackFilled]}
          />
        ))}
      </View>
      <Text style={primitiveStyles.progressCount}>{current}/{total}</Text>
    </View>
  );
}

const primitiveStyles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.sm,
    position: "relative",
    overflow: "hidden"
  },
  buttonPrimary: {
    backgroundColor: equinaTheme.colors.brass,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  buttonSecondary: {
    backgroundColor: equinaTheme.surfaces.raised
  },
  buttonDisabled: {
    backgroundColor: equinaTheme.material.quiet,
    opacity: 1,
    shadowOpacity: 0,
    elevation: 0
  },
  buttonText: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: equinaTheme.colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "left"
  },
  buttonTextSecondary: {
    color: equinaTheme.text.primary
  },
  buttonTextDisabled: {
    color: equinaTheme.text.tertiary
  },
  iconButton: {
    width: equinaTheme.accessibility.minimumTapTarget,
    height: equinaTheme.accessibility.minimumTapTarget,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  iconButtonGlass: {
    backgroundColor: equinaTheme.material.quiet
  },
  iconButtonAccent: {
    backgroundColor: equinaTheme.colors.brass
  },
  iconButtonDisabled: {
    opacity: 0.4
  },
  // Moved as they were from App.tsx's stableViewSwitch/stableViewTab*.
  segmentedTabs: {
    minHeight: 50,
    borderRadius: equinaTheme.radius.control,
    padding: 3,
    flexDirection: "row",
    gap: 3,
    backgroundColor: equinaTheme.material.quiet
  },
  segmentedTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center",
    outlineStyle: "solid",
    outlineWidth: 0
  },
  segmentedTabActive: {
    backgroundColor: equinaTheme.material.selected
  },
  segmentedTabText: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600"
  },
  segmentedTabTextActive: {
    color: equinaTheme.text.primary
  },
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,6,5,0.58)"
  },
  sheet: {
    maxHeight: "86%",
    borderTopLeftRadius: equinaTheme.radius.sheet,
    borderTopRightRadius: equinaTheme.radius.sheet,
    overflow: "hidden",
    backgroundColor: "rgba(20,18,15,0.94)"
  },
  sheetHeader: {
    minHeight: 64,
    paddingLeft: equinaTheme.spacing.md,
    paddingRight: equinaTheme.spacing.compact,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  sheetTitle: {
    flex: 1,
    minWidth: 0,
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary
  },
  sheetClose: {
    width: equinaTheme.accessibility.minimumTapTarget,
    height: equinaTheme.accessibility.minimumTapTarget,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  sheetContent: {
    paddingHorizontal: equinaTheme.spacing.md,
    paddingBottom: equinaTheme.spacing.lg
  },
  sheetScroll: {
    flexShrink: 1
  },
  field: {
    gap: equinaTheme.spacing.sm
  },
  fieldLabelRow: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  label: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  optional: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  },
  input: {
    minHeight: 52,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: equinaTheme.spacing.md,
    color: equinaTheme.text.primary,
    backgroundColor: equinaTheme.material.field,
    fontSize: equinaTheme.typography.body.fontSize,
    lineHeight: equinaTheme.typography.body.lineHeight,
    fontWeight: "400",
    borderWidth: 1,
    borderColor: equinaTheme.material.fieldBorder,
    outlineWidth: 0,
    outlineColor: "transparent"
  },
  inputFocused: {
    backgroundColor: equinaTheme.material.fieldFocused,
    borderColor: equinaTheme.colors.brass
  },
  webInput: {
    outlineStyle: "none"
  } as never,
  selectorBlock: {
    gap: equinaTheme.spacing.sm
  },
  selector: {
    minHeight: 52,
    borderRadius: equinaTheme.radius.control,
    padding: 3,
    flexDirection: "row",
    backgroundColor: equinaTheme.material.quiet
  },
  selectorItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: equinaTheme.radius.compact,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center"
  },
  selectorItemSelected: {
    backgroundColor: equinaTheme.surfaces.elevated
  },
  selectorItemWide: {
    flex: 1.25
  },
  selectorItemCompact: {
    flex: 0.65
  },
  selectorText: {
    color: equinaTheme.text.secondary,
    fontSize: equinaTheme.typography.label.fontSize,
    lineHeight: equinaTheme.typography.label.lineHeight,
    fontWeight: "600",
    textAlign: "center"
  },
  selectorTextSelected: {
    color: equinaTheme.colors.brass
  },
  progressRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  progressTracks: {
    flex: 1,
    flexDirection: "row",
    gap: equinaTheme.spacing.xs
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: equinaTheme.radius.compact,
    backgroundColor: "rgba(247,243,234,0.12)"
  },
  progressTrackFilled: {
    backgroundColor: equinaTheme.colors.brass
  },
  progressLabel: {
    ...equinaTheme.typography.meta,
    minWidth: 64,
    color: equinaTheme.text.secondary
  },
  progressCount: {
    ...equinaTheme.typography.meta,
    minWidth: 24,
    color: equinaTheme.text.tertiary,
    textAlign: "right"
  }
});
