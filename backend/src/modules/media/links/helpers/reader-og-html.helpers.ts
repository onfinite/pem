import { load } from 'cheerio';

export type OgMetaExtracted = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
};

function trimText(s: string | undefined): string | null {
  const t = s?.trim();
  return t && t.length > 0 ? t : null;
}

function absolutizeImage(
  raw: string | undefined,
  baseUrl: string,
): string | null {
  const u = raw?.trim();
  if (!u) return null;
  try {
    const abs = new URL(u, baseUrl).href;
    if (!/^https?:\/\//i.test(abs)) return null;
    return abs.length > 2000 ? abs.slice(0, 2000) : abs;
  } catch {
    return null;
  }
}

/** Read Open Graph + `<title>` from static HTML (no JS execution). */
export function extractOgMetaFromHtml(
  html: string,
  responseBaseUrl: string,
): OgMetaExtracted {
  const $ = load(html);

  const ogTitle = trimText($('meta[property="og:title"]').attr('content'));
  const title =
    ogTitle ?? trimText($('meta[name="og:title"]').attr('content')) ?? null;
  const docTitle = trimText($('title').first().text());
  const resolvedTitle = title ?? docTitle;

  const ogDesc = trimText(
    $('meta[property="og:description"]').attr('content') ??
      $('meta[name="og:description"]').attr('content'),
  );

  const ogImageRaw =
    $('meta[property="og:image"]').attr('content') ??
    $('meta[name="og:image"]').attr('content');

  return {
    title: resolvedTitle,
    description: ogDesc,
    imageUrl: absolutizeImage(ogImageRaw, responseBaseUrl),
  };
}

/** Same signals as login-gated HTML shells (no JS render). */
export function looksLikeLoginWallHtml(html: string): boolean {
  const t = html.toLowerCase();
  if (html.length > 50_000) return false;
  return /\b(sign in to|log in to|sign in|log in|subscribe to (read|continue)|create (a free |an |)account|this article is for subscribers|subscription required|cookies?\s*required)\b/i.test(
    t,
  );
}
