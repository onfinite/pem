import type { ChatLinkPreview } from "@/services/api/pemApi";

/**
 * Removes URL substrings that already have server-side link previews,
 * so the bubble shows context text + cards instead of a raw long URL.
 */
export function stripResolvedLinkUrlsFromUserText(
  raw: string,
  previews: ChatLinkPreview[] | null | undefined,
): string {
  if (!previews?.length || !raw.trim()) return raw;
  const urls = new Set<string>();
  for (const p of previews) {
    urls.add(p.original_url);
    if (p.canonical_url) urls.add(p.canonical_url);
  }
  let out = raw;
  const sorted = [...urls].sort((a, b) => b.length - a.length);
  for (const u of sorted) {
    if (u.length < 4) continue;
    out = out.split(u).join("");
  }
  return out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
