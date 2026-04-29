/** Best-effort product / og image URL from classifier metadata. */
export function linkImageUrlFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = meta.image_url ?? meta.imageUrl;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const u = raw.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return u.length > 2000 ? u.slice(0, 2000) : u;
}
