import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

/**
 * A block that fades in and settles a few points up when it mounts with
 * `animate`; otherwise it is simply there. Only the value at mount counts, so
 * a block that already arrived never plays again on a later render.
 */
export function ArrivingView({
  animate,
  style,
  children
}: {
  animate: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const animatesOnMount = useRef(animate).current;
  const progress = useRef(new Animated.Value(animatesOnMount ? 0 : 1)).current;

  useEffect(() => {
    if (!animatesOnMount) return;
    const arrival = Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });
    arrival.start();
    return () => arrival.stop();
  }, [animatesOnMount, progress]);

  if (!animatesOnMount) return <Animated.View style={style}>{children}</Animated.View>;
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }]
        }
      ]}
    >
      {children}
    </Animated.View>
  );
}
