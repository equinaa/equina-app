import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet } from "react-native";
import { LaunchMark } from "./LaunchMark";

/**
 * Lies over the whole app from its first frame -- the same picture as the
 * native launch screen -- and fades away once the app knows where the rider
 * stands (the session is no longer restoring). It stays at least MIN_SHOWN_MS
 * so a fast start fades instead of flashing, and never more than that past
 * the moment the app is ready.
 */
const MIN_SHOWN_MS = 900;
const FADE_MS = 420;

let released = false;
const listeners = new Set<() => void>();

/** Called by the app when the session has settled. Later calls do nothing. */
export function releaseLaunchCurtain() {
  if (released) return;
  released = true;
  for (const listener of listeners) listener();
  listeners.clear();
}

export function LaunchCurtain() {
  const [gone, setGone] = useState(false);
  // Opaque, it keeps taps off the screen it hides; fading, it lets them through.
  const [fading, setFading] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const mountedAt = useRef(Date.now()).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fade: Animated.CompositeAnimation | undefined;
    const leave = () => {
      timer = setTimeout(() => {
        setFading(true);
        fade = Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== "web"
        });
        fade.start(({ finished }) => finished && setGone(true));
      }, Math.max(0, MIN_SHOWN_MS - (Date.now() - mountedAt)));
    };
    if (released) leave();
    else listeners.add(leave);
    return () => {
      listeners.delete(leave);
      if (timer) clearTimeout(timer);
      fade?.stop();
    };
  }, [mountedAt, opacity]);

  if (gone) return null;
  return (
    <Animated.View pointerEvents={fading ? "none" : "auto"} style={[StyleSheet.absoluteFill, { opacity }]}>
      <LaunchMark />
    </Animated.View>
  );
}
