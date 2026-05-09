import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ASYNC_LAST_CLERK_PUBLISHABLE_KEY,
  CLERK_CLIENT_JWT_STORAGE_KEY,
} from "@/constants/clerkStorage";
import { pemClerkTokenCache } from "@/services/auth/pemClerkTokenCache";

/**
 * If the user switched Clerk instances (e.g. pk_test → pk_live), clear the
 * cached native JWT before Clerk boots — the SDK only auto-clears on in-process
 * key change, not on cold start after `.env` changed.
 */
export async function alignClerkStorageWithPublishableKey(
  publishableKey: string,
): Promise<void> {
  const prev = await AsyncStorage.getItem(ASYNC_LAST_CLERK_PUBLISHABLE_KEY);
  if (
    prev != null &&
    prev !== publishableKey &&
    typeof pemClerkTokenCache?.clearToken === "function"
  ) {
    await pemClerkTokenCache.clearToken(CLERK_CLIENT_JWT_STORAGE_KEY);
  }
  await AsyncStorage.setItem(ASYNC_LAST_CLERK_PUBLISHABLE_KEY, publishableKey);
}
