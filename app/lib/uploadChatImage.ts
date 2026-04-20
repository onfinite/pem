import * as FileSystem from "expo-file-system/legacy";

import {
  requestPhotoUploadUrl,
  sendChatMessage,
  type ApiMessage,
} from "@/lib/pemApi";
import { sha256HexFromLocalUri } from "@/utils/sha256HexFromLocalUri";

const CONTENT_TYPE = "image/jpeg" as const;

export type UploadedChatImageKey = {
  key: string;
  mime: string | null;
  content_sha256: string;
};

export async function uploadPendingChatImageKeys(
  getToken: () => Promise<string | null>,
  localUris: string[],
): Promise<UploadedChatImageKey[]> {
  if (localUris.length === 0) {
    throw new Error("No images to upload");
  }
  const keys: UploadedChatImageKey[] = [];
  for (const localUri of localUris) {
    const info = await FileSystem.getInfoAsync(localUri);
    const byteSize = info.exists ? info.size : undefined;
    const content_sha256 = await sha256HexFromLocalUri(localUri);
    const res = await requestPhotoUploadUrl(getToken, {
      content_type: CONTENT_TYPE,
      byte_size: byteSize,
      content_sha256,
    });
    if (res.is_duplicate === true) {
      keys.push({ key: res.image_key, mime: CONTENT_TYPE, content_sha256 });
      continue;
    }
    if (!res.upload_url) {
      throw new Error("No upload URL returned");
    }
    const result = await FileSystem.uploadAsync(res.upload_url, localUri, {
      httpMethod: "PUT",
      headers: { "Content-Type": CONTENT_TYPE },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Upload failed (${result.status})`);
    }
    keys.push({ key: res.image_key, mime: CONTENT_TYPE, content_sha256 });
  }
  return keys;
}

export async function uploadChatImagesAndSend(
  getToken: () => Promise<string | null>,
  localUris: string[],
  opts?: { content?: string },
): Promise<{ message: ApiMessage; status: string; deduplicated?: boolean }> {
  const keys = await uploadPendingChatImageKeys(getToken, localUris);
  const caption = opts?.content?.trim();
  return sendChatMessage(getToken, {
    kind: "image",
    image_keys: keys.map((k) => ({
      key: k.key,
      mime: k.mime,
      content_sha256: k.content_sha256,
    })),
    ...(caption ? { content: caption } : {}),
  });
}

export async function uploadChatImageAndSend(
  getToken: () => Promise<string | null>,
  localUri: string,
  opts?: { content?: string },
): Promise<{ message: ApiMessage; status: string; deduplicated?: boolean }> {
  return uploadChatImagesAndSend(getToken, [localUri], opts);
}
