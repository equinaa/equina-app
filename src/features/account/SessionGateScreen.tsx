import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WifiOff } from "lucide-react-native";
import { EquinaButton } from "../../ui/primitives/EquinaPrimitives";
import { equinaTheme } from "../../ui/theme/theme";

export function SessionGateScreen({
  state,
  error,
  onRetry
}: {
  state: "restoring" | "error";
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.root}>
      {state === "restoring" ? (
        <>
          <Text style={styles.brand}>Equina</Text>
          <ActivityIndicator color={equinaTheme.colors.brass} />
          <Text accessibilityLiveRegion="polite" style={styles.body}>Restoring your private session...</Text>
        </>
      ) : (
        <>
          <WifiOff size={26} color={equinaTheme.colors.brass} />
          <Text accessibilityRole="header" style={styles.title}>We could not reconnect.</Text>
          <Text accessibilityRole="alert" style={styles.body}>
            {error || "Check your connection and try again. Your account data has not been changed."}
          </Text>
          {onRetry ? <EquinaButton testID="session-retry" label="Try again" onPress={onRetry} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: equinaTheme.surfaces.canvas,
    paddingHorizontal: 28
  },
  brand: {
    color: equinaTheme.text.primary,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    marginBottom: 4
  },
  title: {
    color: equinaTheme.text.primary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    textAlign: "center"
  },
  body: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    textAlign: "center",
    maxWidth: 320
  }
});
