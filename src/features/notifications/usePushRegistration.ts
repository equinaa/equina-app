import { useCallback, useState } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { EquinaBackend } from "../../backend";

/**
 * This phone's push token for Shop messages, registered while the rider has
 * human messages on. A tap on one is opened by useNotificationTaps, with
 * every other notification: two listeners would each act on the same tap.
 */
export function usePushRegistration({
  backend,
  enabled,
  authenticated
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
  authenticated: boolean;
}) {
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState<"idle" | "registering" | "ready" | "denied" | "error">("idle");

  const register = useCallback(async () => {
    if (!backend || !enabled || !authenticated || Platform.OS === "web") return false;
    setStatus("registering");
    try {
      const current = await Notifications.getPermissionsAsync();
      const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
      if (!permission.granted) {
        setStatus("denied");
        return false;
      }
      const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
      if (!projectId) throw new Error("EAS project ID is not configured.");
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      const device = await backend.notifications.register({
        token: token.data,
        platform: Platform.OS === "ios" ? "ios" : "android",
        appVersion: "0.1.0"
      });
      setDeviceId(device.id);
      setStatus("ready");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }, [authenticated, backend, enabled]);

  const revoke = useCallback(async () => {
    if (!backend || !deviceId) return;
    await backend.notifications.revoke(deviceId);
    setDeviceId("");
    setStatus("idle");
  }, [backend, deviceId]);

  return { status, register, revoke };
}
