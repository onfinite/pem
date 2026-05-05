/** Aligns with `resolveImagePipelineContent` section delimiter. */
export const VISION_SECTION_DELIM = '\n\n---\n\n';

export function visionSectionsForKeys(
  visionFull: string,
  keyCount: number,
): string[] {
  if (!visionFull.trim() || keyCount <= 1) {
    return [visionFull.trim()];
  }
  const rawParts = visionFull.split(VISION_SECTION_DELIM);
  const stripped = rawParts.map((s) =>
    s.replace(/^\[Photo \d+\/\d+\]\s*\n?/, '').trim(),
  );
  if (stripped.length === keyCount) return stripped;
  return Array.from({ length: keyCount }, (_, i) => {
    const part = stripped[i]?.trim();
    if (part) return stripped[i];
    return `[Photo ${i + 1}/${keyCount}] (Vision unavailable — could not align this frame.)`;
  });
}
