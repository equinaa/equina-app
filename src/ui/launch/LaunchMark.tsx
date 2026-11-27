import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "../motion/useReducedMotion";
import { LAUNCH_BROWN, LAUNCH_MARK_FRACTION } from "./launch-look";

const HALO_SCALE = 1.5; // assets/launch/halo.png is 1.5x the medal
const MARK_PAD = 1.3; // assets/launch/mark.png is the medal with its shadow: 1.3x the medal
const WORDMARK_FRACTION = 0.3;
const WORDMARK_RATIO = 323 / 984; // assets/launch/wordmark.png, trimmed
const TURN_MS = 2400;
const native = Platform.OS !== "web";

const mark = require("../../../assets/launch/mark.png");
const halo = require("../../../assets/launch/halo.png");
const wordmark = require("../../../assets/launch/wordmark.png");

/**
 * The Equina symbol on the launch brown, with a gold light circling its rim
 * while the app gets ready, and the wordmark settling in under it. With
 * Reduce Motion on, the light stays still.
 */
export function LaunchMark() {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const turn = useRef(new Animated.Value(0)).current;
  const haloIn = useRef(new Animated.Value(0)).current;
  const wordmarkIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const arrival = Animated.parallel([
      Animated.timing(haloIn, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(wordmarkIn, {
        toValue: 1,
        duration: 520,
        delay: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: native
      })
    ]);
    arrival.start();
    return () => arrival.stop();
  }, [haloIn, wordmarkIn]);

  useEffect(() => {
    if (reducedMotion) return;
    turn.setValue(0);
    const loop = Animated.loop(
      Animated.timing(turn, { toValue: 1, duration: TURN_MS, easing: Easing.linear, useNativeDriver: native })
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, turn]);

  const size = Math.round(width * LAUNCH_MARK_FRACTION);
  const haloSize = Math.round(size * HALO_SCALE);
  const wordmarkWidth = Math.round(width * WORDMARK_FRACTION);
  // The light starts at the top right, where the symbol's own gold rim fades out.
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["-60deg", "300deg"] });

  return (
    <View style={styles.root} accessible accessibilityRole="progressbar" accessibilityLabel="Equina is opening">
      <View style={[styles.centre, { width: haloSize, height: haloSize }]}>
        <Animated.Image
          source={halo}
          style={{ position: "absolute", width: haloSize, height: haloSize, opacity: haloIn, transform: [{ rotate }] }}
        />
        <Image source={mark} style={{ position: "absolute", width: size * MARK_PAD, height: size * MARK_PAD }} />
        <Animated.Image
          source={wordmark}
          style={{
            position: "absolute",
            top: haloSize / 2 + size / 2 + Math.round(width * 0.1),
            width: wordmarkWidth,
            height: Math.round(wordmarkWidth * WORDMARK_RATIO),
            opacity: wordmarkIn,
            transform: [{ translateY: wordmarkIn.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }]
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LAUNCH_BROWN
  },
  centre: {
    alignItems: "center",
    justifyContent: "center"
  }
});
