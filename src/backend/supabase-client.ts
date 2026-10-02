import "react-native-url-polyfill/auto";

import { createClient, processLock, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { readBackendConfig } from "./config";
import { EquinaBackendError } from "./errors";
import { secureSessionStorage } from "./secure-session-storage";

let client: SupabaseClient | null = null;
let autoRefreshBound = false;

// supabase-js's own default key, spelled out so the session can be removed
// without it (see forgetStoredSession). Changing it would sign everyone out.
const sessionStorageKey = (url: string) => `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

export const getSupabaseClient = (): SupabaseClient => {
  if (client) return client;
  const config = readBackendConfig();
  if (!config) throw new EquinaBackendError("Equina backend is not configured.", "backend_unconfigured");

  client = createClient(config.url, config.publishableKey, {
    auth: {
      ...(Platform.OS !== "web" ? { storage: secureSessionStorage } : {}),
      storageKey: sessionStorageKey(config.url),
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

/**
 * Deletes the stored session directly. supabase-js's signOut returns early,
 * removing nothing, when the access token has expired and the refresh fails
 * offline; the rider would be told they signed out while the next launch
 * signed them straight back in.
 */
export const forgetStoredSession = async () => {
  const config = readBackendConfig();
  if (!config) return;
  const key = sessionStorageKey(config.url);
  const storage = Platform.OS !== "web"
    ? secureSessionStorage
    : typeof window !== "undefined" ? window.localStorage : null;
  if (!storage) return;
  for (const suffix of ["", "-code-verifier", "-user"]) {
    await storage.removeItem(key + suffix);
  }
};

export const resetSupabaseClientForTests = () => {
  client = null;
};
