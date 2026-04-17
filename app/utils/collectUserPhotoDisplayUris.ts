export type PhotoDisplaySource = {
  image_urls?: { url: string }[] | null;
  /** Voice + photos optimistic: image URIs only (voice uses `_localUri`). */
  _pendingImageUris?: string[] | null;
  _pendingLocalUris?: string[] | null;
  _localUri?: string | null;
};

export function collectUserPhotoDisplayUris(
  message: PhotoDisplaySource,
): string[] {
  const pendingVoiceImages =
    message._pendingImageUris?.filter(Boolean) ?? [];
  if (pendingVoiceImages.length > 0) return pendingVoiceImages;
  const remotes = message.image_urls?.map((x) => x.url).filter(Boolean) ?? [];
  if (remotes.length > 0) return remotes;
  const pending = message._pendingLocalUris?.filter(Boolean) ?? [];
  if (pending.length > 0) return pending;
  if (message._localUri) return [message._localUri];
  return [];
}
