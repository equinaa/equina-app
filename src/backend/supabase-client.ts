import "react-native-url-polyfill/auto";

import { createClient, processLock, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { readBackendConfig } from "./config";
import { EquinaBackendError } from "./errors";
import { secureSessionStorage } from "./secure-session-storage";

let client: SupabaseClient | null = null;
let autoRefreshBound = false;

export const getSupabaseClient = (): SupabaseClient => {
  if (client) return client;
  const config = readBackendConfig();
  if (!config) throw new EquinaBackendError("Equina backend is not configured.", "backend_unconfigured");

  client = createClient(config.url, config.publishableKey, {
    auth: {
      ...(Platform.OS !== "web" ? { storage: secureSessionStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      lock: processLock
    }
  });

  if (Platform.OS !== "web" && !autoRefreshBound) {
    autoRefreshBound = true;
    AppState.addEventListener("change", (state) => {
      if (!client) return;
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }

  return client;
};

export const resetSupabaseClientForTests = () => {
  client = null;
};
