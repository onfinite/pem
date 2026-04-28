import { pickBestLinkPreviewImageUrl } from '@/chat/utils/link-preview-image-url-quality';

const MAX_SCAN = 200_000;

function sanitizeImageUrl(raw: string): string | null {
  const u = raw.trim().replace(/\)+$/, '');
  if (!/^https?:\/\//i.test(u) || u.length > 2000) return null;
  if (/^https?:\/\/[^/]+\/1x1/i.test(u)) return null;
  return u;
}

/** All image URLs found in Jina markdown (order preserved for tie-break). */
export function collectLinkPreviewImageUrlsFromMarkdown(
  markdown: string | null | undefined,
): string[] {
  if (!markdown?.trim()) return [];
  const slice =
    markdown.length > MAX_SCAN ? markdown.slice(0, MAX_SCAN) : markdown;

  const candidates: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const u = sanitizeImageUrl(raw);
    if (u && !seen.has(u)) {
      seen.add(u);
      candidates.push(u);
    }
  };

  const mdImg = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = mdImg.exec(slice)) !== null) push(m[1]);

  const imgTag = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = imgTag.exec(slice)) !== null) push(m[1]);

  const bareImg =
    /https?:\/\/[^\s"'<>)]+\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?[^\s"'<>)]*)?/gi;
  while ((m = bareImg.exec(slice)) !== null) push(m[0]);

  /** Discourse / forum pages often expose the hero only as og:image, not as markdown images. */
  const ogPropFirst =
    /<meta[^>]+property=["']og:image["'][^>]+content=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = ogPropFirst.exec(slice)) !== null) push(m[1]);

  const ogContentFirst =
    /<meta[^>]+content=["'](https?:\/\/[^"']+)["'][^>]+property=["']og:image["']/gi;
  while ((m = ogContentFirst.exec(slice)) !== null) push(m[1]);

  const ogNameFirst =
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = ogNameFirst.exec(slice)) !== null) push(m[1]);

  return candidates;
}

export function linkPreviewImageUrlFromMarkdown(
  markdown: string | null | undefined,
): string | null {
  return pickBestLinkPreviewImageUrl(
    collectLinkPreviewImageUrlsFromMarkdown(markdown),
  );
}
