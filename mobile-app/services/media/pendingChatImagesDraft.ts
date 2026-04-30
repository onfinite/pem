import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import { MAX_CHAT_MESSAGE_IMAGES } from "@/constants/chatPhotos.constants";

import type { PendingChatImage } from "@/services/media/pendingChatImagesFromPicker";

function storageKey(userId: string): string {
  return `@pem/chat_pending_images_v1_${userId}`;
}

function parseDraftRow(row: unknown): { uri: string; assetId: string | null } | null {
  if (!row || typeof row !== "object") return null;
  const o = row as { uri?: unknown; assetId?: unknown };
  if (typeof o.uri !== "string" || !o.uri.trim()) return null;
  const assetId =
    typeof o.assetId === "string" && o.assetId.trim() ? o.assetId.trim() : null;
  return { uri: o.uri.trim(), assetId };
}

/**
 * Restores pending composer photos from AsyncStorage; drops URIs whose files no longer exist.
 */
export async function loadPendingImagesDraft(
  userId: string,
): Promise<PendingChatImage[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: PendingChatImage[] = [];
    for (const row of parsed) {
      const item = parseDraftRow(row);
      if (!item) continue;
      const info = await FileSystem.getInfoAsync(item.uri);
      if (!info.exists) continue;
      out.push({ uri: item.uri, assetId: item.assetId });
      if (out.length >= MAX_CHAT_MESSAGE_IMAGES) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function savePendingImagesDraft(
  userId: string,
  images: PendingChatImage[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(images));
  } catch {
    /* non-critical */
  }
}
