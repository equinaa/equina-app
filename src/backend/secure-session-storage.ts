import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { SupportedStorage } from "@supabase/supabase-js";
import { createChunkedSessionStorage } from "./chunked-session-storage";

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

export const secureSessionStorage: SupportedStorage = createChunkedSessionStorage({
  secureStore: {
    getItem: (key) => SecureStore.getItemAsync(key, secureOptions),
    setItem: (key, value) => SecureStore.setItemAsync(key, value, secureOptions),
    removeItem: (key) => SecureStore.deleteItemAsync(key, secureOptions)
  },
  legacyStore: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key)
  }
});
