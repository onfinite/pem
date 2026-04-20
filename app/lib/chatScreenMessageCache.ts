import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  hydrateCachedImagePaths,
  persistImagesForCacheMessages,
} from "@/lib/chatCachePersistedImages";

import type { ClientMessage } from "./chatScreenClientMessage.types";

export const CHAT_MESSAGES_CACHE_KEY = "@pem/chat_messages_v1";
/** Offline slice + disk image budget; older rows stay in RAM via pagination and load from the API when scrolled up. */
export const CHAT_MESSAGES_CACHE_LIMIT = 50;

export async function readChatMessagesCache(): Promise<ClientMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_MESSAGES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClientMessage[];
    return hydrateCachedImagePaths(parsed);
  } catch {
    return [];
  }
}

export async function writeChatMessagesCache(messages: ClientMessage[]) {
  try {
    const cacheable = messages
      .filter(
        (m) =>
          m._clientStatus === "sent" &&
          !m._localUri &&
          !m._pendingLocalUris?.length,
      )
      .slice(-CHAT_MESSAGES_CACHE_LIMIT);
    const withDiskImages = await persistImagesForCacheMessages(cacheable);
    await AsyncStorage.setItem(
      CHAT_MESSAGES_CACHE_KEY,
      JSON.stringify(withDiskImages),
    );
  } catch {
    // Non-critical — ignore cache write errors
  }
}

/** Keep on-device photo URIs when the server list is re-fetched (API rows omit them). */
export function mergeServerMessagesWithClientLocals(
  prev: ClientMessage[],
  fromServer: ClientMessage[],
): ClientMessage[] {
  const prevById = new Map(prev.map((m) => [m.id, m]));
  return fromServer.map((msg) => {
    const old = prevById.get(msg.id);
    if (!old) return msg;
    return {
      ...msg,
      ...(old._localUri ? { _localUri: old._localUri } : {}),
      ...(old._pendingLocalUris?.length
        ? { _pendingLocalUris: old._pendingLocalUris }
        : {}),
      ...(old._pendingImageUris?.length
        ? { _pendingImageUris: old._pendingImageUris }
        : {}),
      ...(old._persistedImageUris?.length
        ? { _persistedImageUris: old._persistedImageUris }
        : {}),
      ...(old._persistedPhotoRecall?.length
        ? { _persistedPhotoRecall: old._persistedPhotoRecall }
        : {}),
    };
  });
}
