import { tokenCache as defaultClerkTokenCache } from "@clerk/expo/token-cache";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Mirrors @clerk/expo/token-cache on native, plus `clearToken`.
 * Clerk's singleton calls `clearToken(__clerk_client_jwt)` when the publishable
 * key changes; the stock cache omits that method, so a JWT from another instance
 * can persist and block `useAuth().isLoaded` forever.
 */
const secureStoreOpts = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
} as const;

function createNativeTokenCache() {
  return {
    getToken: async (key: string): Promise<string | null> => {
      try {
        return await SecureStore.getItemAsync(key, secureStoreOpts);
      } catch {
        await SecureStore.deleteItemAsync(key, secureStoreOpts);
        return null;
      }
    },
    saveToken: (key: string, token: string) =>
      SecureStore.setItemAsync(key, token, secureStoreOpts),
    clearToken: async (key: string) => {
      try {
        await SecureStore.deleteItemAsync(key, secureStoreOpts);
      } catch {
        // best-effort — key may already be absent
      }
    },
  };
}

export const pemClerkTokenCache =
  Platform.OS === "ios" || Platform.OS === "android"
    ? createNativeTokenCache()
    : defaultClerkTokenCache;
