import * as ImageManipulator from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";

export type PendingChatImage = { uri: string; assetId?: string | null };

/**
 * Resize/compress picker assets and dedupe against existing pending rows.
 */
export async function pendingImagesFromPickerAssets(
  assets: ImagePickerAsset[],
  pendingImages: PendingChatImage[],
  maxAdd: number,
): Promise<PendingChatImage[]> {
  const usedAssetIds = new Set(
    pendingImages
      .map((p) => p.assetId)
      .filter((id): id is string => Boolean(id)),
  );
  const existingUris = new Set(pendingImages.map((p) => p.uri));
  const additions: PendingChatImage[] = [];

  for (const asset of assets.slice(0, maxAdd)) {
    const assetId = asset.assetId ?? null;
    if (assetId && usedAssetIds.has(assetId)) {
      continue;
    }
    const resize =
      asset.width && asset.width > 1600
        ? [{ resize: { width: 1600 } } as const]
        : [];
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [...resize],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    if (existingUris.has(manipulated.uri)) {
      continue;
    }
    additions.push({ uri: manipulated.uri, assetId });
    if (assetId) {
      usedAssetIds.add(assetId);
    }
    existingUris.add(manipulated.uri);
  }

  return additions;
}
