import { useEffect, useState } from "react";
import type { PendingChatImage } from "@/services/media/pendingChatImagesFromPicker";
import {
  loadPendingImagesDraft,
  savePendingImagesDraft,
} from "@/services/media/pendingChatImagesDraft";

export function useChatPendingImagesDraft(
  isAuthLoaded: boolean,
  userId: string | null | undefined,
) {
  const [pendingImages, setPendingImages] = useState<PendingChatImage[]>([]);
  const [pendingImagesHydrated, setPendingImagesHydrated] = useState(false);

  useEffect(() => {
    if (!isAuthLoaded) return;
    if (!userId) {
      setPendingImages([]);
      setPendingImagesHydrated(true);
      return;
    }
    setPendingImages([]);
    setPendingImagesHydrated(false);
    let cancelled = false;
    void (async () => {
      const restored = await loadPendingImagesDraft(userId);
      if (cancelled) return;
      setPendingImages(restored);
      setPendingImagesHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoaded, userId]);

  useEffect(() => {
    if (!isAuthLoaded || !userId || !pendingImagesHydrated) return;
    void savePendingImagesDraft(userId, pendingImages);
  }, [isAuthLoaded, userId, pendingImages, pendingImagesHydrated]);

  return { pendingImages, setPendingImages, pendingImagesHydrated };
}
