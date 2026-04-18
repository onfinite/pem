export type PhotoDisplaySource = {
  image_urls?: { url: string }[] | null;
  /** Voice + photos optimistic: image URIs only (voice uses `_localUri`). */
  _pendingImageUris?: string[] | null;
  _pendingLocalUris?: string[] | null;
  _localUri?: string | null;
  /** Files in documentDirectory written when saving the chat cache (cold start). */
  _persistedImageUris?: string[] | null;
};

/**
 * Prefer on-device file URIs over remote URLs so sent bubbles do not flash
 * re-download from CDN while the same bytes are still available locally.
 */
export function collectUserPhotoDisplayUris(
  message: PhotoDisplaySource,
): string[] {
  const pendingVoiceImages =
    message._pendingImageUris?.filter(Boolean) ?? [];
  if (pendingVoiceImages.length > 0) return pendingVoiceImages;

  const pendingLocals = message._pendingLocalUris?.filter(Boolean) ?? [];
  if (pendingLocals.length > 0) return pendingLocals;
  if (message._localUri) return [message._localUri];

  const remotes = message.image_urls?.map((x) => x.url).filter(Boolean) ?? [];
  const persisted = message._persistedImageUris?.filter(Boolean) ?? [];
  if (
    persisted.length > 0 &&
    remotes.length > 0 &&
    persisted.length === remotes.length
  ) {
    return persisted;
  }

  if (remotes.length > 0) return remotes;

  return [];
}
