import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const runNativeHaptic = (feedback: () => Promise<void>) => {
  if (Platform.OS === "web") return;
  void feedback().catch(() => undefined);
};

export const selectionHaptic = () => runNativeHaptic(() => Haptics.selectionAsync());

export const actionHaptic = () =>
  runNativeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

export const completionHaptic = () =>
  runNativeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

export const warningHaptic = () =>
  runNativeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
