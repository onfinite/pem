import type { PersistedPhotoRecallRow } from "@/services/cache/chatCachePersistedImages";
import type { ApiMessage } from "@/services/api/pemApi";

export type ClientMessage = ApiMessage & {
  _clientStatus?: "sending" | "sent" | "failed";
  _localUri?: string;
  /** Optimistic multi-photo local URIs (same order as upload batch). */
  _pendingLocalUris?: string[];
  /** Voice + photos optimistic: image URIs (audio uses `_localUri`). */
  _pendingImageUris?: string[];
  /** documentDirectory file URIs saved with chat cache for offline reload. */
  _persistedImageUris?: string[];
  /** Local files for Pem "from your photos" recall (same message id as Pem bubble). */
  _persistedPhotoRecall?: PersistedPhotoRecallRow[];
};
