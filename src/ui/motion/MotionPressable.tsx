import { useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { equinaTheme } from "../theme/theme";
import { useReducedMotion } from "./useReducedMotion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type MotionPressableProps = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
};

export function MotionPressable({
  children,
  disabled,
  onPressIn,
  onPressOut,
  pressedScale = 0.975,
  style,
  ...props
}: MotionPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();

  const animateTo = (value: number, duration: number) => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }

    scale.stopAnimation();
    Animated.timing(scale, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!disabled) animateTo(pressedScale, equinaTheme.motion.pressIn);
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    animateTo(1, equinaTheme.motion.pressOut);
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
