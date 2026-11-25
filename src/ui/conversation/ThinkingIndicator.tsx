import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { equinaTheme } from "../theme/theme";

const dotCount = 3;

/**
 * "Thinking" under the author's name, set where the answer will appear, with
 * three dots that rise and brighten in turn. With reduced motion the dots stay
 * still. Screen readers hear "<author> is thinking" once.
 */
export function ThinkingIndicator({
  author,
  reducedMotion,
  testID
}: {
  author: string;
  reducedMotion: boolean;
  testID?: string;
}) {
  const dots = useRef(Array.from({ length: dotCount }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (reducedMotion) {
      dots.forEach((dot) => dot.setValue(1));
      return;
    }
    const pulse = (dot: Animated.Value) =>
      Animated.sequence([
        Animated.timing(dot, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true })
      ]);
    const loop = Animated.loop(
      Animated.sequence([Animated.stagger(150, dots.map(pulse)), Animated.delay(180)])
    );
    loop.start();
    return () => {
      loop.stop();
      dots.forEach((dot) => dot.setValue(0));
    };
  }, [dots, reducedMotion]);

  return (
    <View
      testID={testID}
      style={styles.row}
      accessible
      accessibilityLabel={`${author} is thinking`}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.author}>{author}</Text>
      <View style={styles.line}>
        <Text style={styles.label}>Thinking</Text>
        <View style={styles.dots}>
          {dots.map((dot, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                  transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }]
                }
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Lines up with ConversationMessage's author and coach answer, so the answer
  // takes this row's place without a jump.
  row: {
    alignItems: "flex-start",
    gap: 4
  },
  author: {
    color: equinaTheme.colors.brass,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    paddingHorizontal: 2
  },
  line: {
    minHeight: 23,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 2
  },
  label: {
    color: equinaTheme.text.secondary,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "400"
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 3
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: equinaTheme.colors.brass
  }
});
