import * as FileSystem from "expo-file-system/legacy";

import {
  requestPhotoUploadUrl,
  sendChatMessage,
  type ApiMessage,
} from "@/lib/pemApi";

const CONTENT_TYPE = "image/jpeg" as const;

export async function uploadPendingChatImageKeys(
  getToken: () => Promise<string | null>,
  localUris: string[],
): Promise<{ key: string; mime: string | null }[]> {
  if (localUris.length === 0) {
    throw new Error("No images to upload");
  }
  const keys: { key: string; mime: string | null }[] = [];
  for (const localUri of localUris) {
    const info = await FileSystem.getInfoAsync(localUri);
    const byteSize = info.exists ? info.size : undefined;
    const { upload_url, image_key } = await requestPhotoUploadUrl(getToken, {
      content_type: CONTENT_TYPE,
      byte_size: byteSize,
    });
    const result = await FileSystem.uploadAsync(upload_url, localUri, {
      httpMethod: "PUT",
      headers: { "Content-Type": CONTENT_TYPE },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Upload failed (${result.status})`);
    }
    keys.push({ key: image_key, mime: CONTENT_TYPE });
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
    image_keys: keys.map((k) => ({ key: k.key, mime: k.mime })),
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
