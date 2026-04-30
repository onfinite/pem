import * as FileSystem from "expo-file-system/legacy";

const CACHE_SUBDIR = "pem-chat-images/v1/";

export type PersistedPhotoRecallRow = {
  image_key: string;
  local_uri: string;
};

export type PersistableCacheMessage = {
  id: string;
  kind: string;
  image_urls?: { url: string }[] | null;
  _persistedImageUris?: string[] | null;
  metadata?: { photo_recall?: { image_key: string; signed_url: string }[] } | null;
  _persistedPhotoRecall?: PersistedPhotoRecallRow[] | null;
};

function imageDir(): string | null {
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  return `${root}${CACHE_SUBDIR}`;
}

async function ensureImageDir(): Promise<string | null> {
  const dir = imageDir();
  if (!dir) return null;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

function destPath(dir: string, messageId: string, index: number): string {
  const safeId = messageId.replace(/[^a-zA-Z0-9-]/g, "_");
  return `${dir}${safeId}_${index}.jpg`;
}

function recallDestPath(
  dir: string,
  pemMessageId: string,
  imageKey: string,
): string {
  const safeMsg = pemMessageId.replace(/[^a-zA-Z0-9-]/g, "_");
  const safeKey = imageKey.replace(/[^a-zA-Z0-9-]/g, "_");
  return `${dir}recall_${safeMsg}_${safeKey}.jpg`;
}

async function hydratePersistedImageUris<T extends PersistableCacheMessage>(
  m: T,
): Promise<T> {
  if (m.kind !== "image" || !m._persistedImageUris?.length) return m;
  const kept: string[] = [];
  for (const p of m._persistedImageUris) {
    const info = await FileSystem.getInfoAsync(p);
    if (info.exists && !info.isDirectory && (info.size ?? 0) > 512) {
      kept.push(p);
    }
  }
  const remoteCount = m.image_urls?.filter((x) => x.url).length ?? 0;
  if (kept.length === remoteCount && remoteCount > 0) {
    return { ...m, _persistedImageUris: kept };
  }
  const { _persistedImageUris: _, ...rest } = m;
  return rest as T;
}

async function hydratePersistedPhotoRecall<T extends PersistableCacheMessage>(
  m: T,
): Promise<T> {
  const recall = m.metadata?.photo_recall;
  const pr = m._persistedPhotoRecall;
  if (!pr?.length || !recall?.length) return m;
  const kept: PersistedPhotoRecallRow[] = [];
  for (const row of pr) {
    const info = await FileSystem.getInfoAsync(row.local_uri);
    if (info.exists && !info.isDirectory && (info.size ?? 0) > 512) {
      kept.push(row);
    }
  }
  if (kept.length === recall.length) {
    return { ...m, _persistedPhotoRecall: kept };
  }
  const { _persistedPhotoRecall: _, ...rest } = m;
  return rest as T;
}

/** Drop missing files from persisted paths after reading JSON from AsyncStorage. */
export async function hydrateCachedImagePaths<T extends PersistableCacheMessage>(
  messages: T[],
): Promise<T[]> {
  return Promise.all(
    messages.map(async (m) => {
      const a = await hydratePersistedImageUris(m);
      return hydratePersistedPhotoRecall(a);
    }),
  );
}

async function persistUserImageMessage<T extends PersistableCacheMessage>(
  m: T,
  dir: string,
): Promise<T> {
  if (m.kind !== "image") return m;
  const urls = m.image_urls?.map((x) => x.url).filter(Boolean) ?? [];
  if (urls.length === 0) return m;

  const paths: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const dest = destPath(dir, m.id, i);
    try {
      const cur = await FileSystem.getInfoAsync(dest);
      if (cur.exists && !cur.isDirectory && (cur.size ?? 0) > 512) {
        paths.push(dest);
        continue;
      }
      const { uri } = await FileSystem.downloadAsync(urls[i]!, dest);
      paths.push(uri);
    } catch {
      paths.length = 0;
      break;
    }
  }

  if (paths.length === urls.length) {
    return { ...m, _persistedImageUris: paths };
  }
  return m;
}

async function persistPhotoRecallForMessage<T extends PersistableCacheMessage>(
  m: T,
  dir: string,
): Promise<T> {
  const recall = m.metadata?.photo_recall;
  if (!recall?.length) return m;

  const rows: PersistedPhotoRecallRow[] = [];
  for (const item of recall) {
    const dest = recallDestPath(dir, m.id, item.image_key);
    try {
      const cur = await FileSystem.getInfoAsync(dest);
      if (cur.exists && !cur.isDirectory && (cur.size ?? 0) > 512) {
        rows.push({ image_key: item.image_key, local_uri: dest });
        continue;
      }
      const { uri } = await FileSystem.downloadAsync(item.signed_url, dest);
      rows.push({ image_key: item.image_key, local_uri: uri });
    } catch {
      return m;
    }
  }

  if (rows.length === recall.length) {
    return { ...m, _persistedPhotoRecall: rows };
  }
  return m;
}

function collectReferencedImagePaths(
  messages: PersistableCacheMessage[],
): Set<string> {
  const keep = new Set<string>();
  for (const m of messages) {
    for (const p of m._persistedImageUris ?? []) {
      if (p) keep.add(p);
    }
    for (const row of m._persistedPhotoRecall ?? []) {
      if (row.local_uri) keep.add(row.local_uri);
    }
  }
  return keep;
}

/** Delete files under the chat image dir that no message in `messages` still references. */
export async function pruneOrphanChatImageFiles(
  messages: PersistableCacheMessage[],
): Promise<void> {
  const dir = imageDir();
  if (!dir) return;
  const rootInfo = await FileSystem.getInfoAsync(dir);
  if (!rootInfo.exists || !rootInfo.isDirectory) return;

  const keep = collectReferencedImagePaths(messages);
  const names = await FileSystem.readDirectoryAsync(dir);
  for (const name of names) {
    const full = `${dir}${name}`;
    if (!keep.has(full)) {
      try {
        await FileSystem.deleteAsync(full, { idempotent: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Download remote chat images (user attachments + Pem "from your photos" recall)
 * into documentDirectory so cached messages survive cold start.
 * Callers should pass the same slice they persist to AsyncStorage (e.g. last 50);
 * then we prune disk so older thumbnails are removed and reload from the network when scrolled back.
 */
export async function persistImagesForCacheMessages<T extends PersistableCacheMessage>(
  messages: T[],
): Promise<T[]> {
  const dir = await ensureImageDir();
  if (!dir) return messages;

  const out: T[] = [];
  for (const m of messages) {
    let next: T = m;
    next = await persistUserImageMessage(next, dir);
    next = await persistPhotoRecallForMessage(next, dir);
    out.push(next);
  }
  await pruneOrphanChatImageFiles(out);
  return out;
}
