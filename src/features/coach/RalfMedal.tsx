import { Image, StyleSheet, View } from "react-native";
import { equinaTheme } from "../../ui/theme/theme";

const medal = require("../../../assets/ralf/ralf-medal.png");

/**
 * Ralf's face: the app icon's medal with his sparkle, and a green dot for
 * online (he answers any time). Decorative: the control around it names him.
 */
export function RalfMedal({ size = 36, ring = equinaTheme.surfaces.frame }: { size?: number; ring?: string }) {
  const dot = Math.max(9, Math.round(size * 0.3));
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={medal} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      <View
        testID="ralf-online"
        style={[styles.online, { width: dot, height: dot, borderRadius: dot / 2, borderColor: ring }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  online: {
    position: "absolute",
    right: -1,
    bottom: -1,
    backgroundColor: "#3FBF7F",
    borderWidth: 2
  }
});
