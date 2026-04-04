/**
 * SerpAPI rows often include several image fields (`thumbnail`, `serpapi_thumbnail`,
 * `image`, `images[]`, `original`, `original_image`). We pick the best candidate for
 * display: higher implied resolution when we can infer it, while keeping SerpAPI
 * proxies competitive (they load reliably in RN).
 */

function pushHttp(candidates: string[], u: unknown): void {
  if (typeof u !== 'string') return;
  const t = u.trim();
  if (t.startsWith('http')) candidates.push(t);
}

/** Score higher = better for hero / card imagery. */
function imageUrlScore(url: string, row: Record<string, unknown>): number {
  let s = 0;
  const lower = url.toLowerCase();
  if (typeof row.image === 'string' && row.image.trim() === url) {
    s += 60;
  }
  if (lower.includes('serpapi.com')) s += 100;
  const wMatch = url.match(/[?&](?:w|width)=(\d+)/i);
  if (wMatch) s += Math.min(parseInt(wMatch[1], 10), 2000) / 12;
  const sEq = url.match(/=s(\d{1,4})(?:-|$)/i);
  if (sEq) s += Math.min(parseInt(sEq[1], 10), 1600) / 10;
  if (/=s\d{1,2}(?:-|$)/.test(url)) s -= 8;
  s += Math.min(url.length / 25, 18);
  return s;
}

/**
 * Collects image URL candidates from a SerpAPI result object and returns the best.
 */
export function pickBestSerpImageUrl(row: Record<string, unknown>): string {
  const candidates: string[] = [];

  pushHttp(candidates, row.image);

  if (Array.isArray(row.images)) {
    for (const img of row.images) {
      if (!img || typeof img !== 'object') continue;
      const o = img as Record<string, unknown>;
      pushHttp(candidates, o.link);
      pushHttp(candidates, o.url);
      pushHttp(candidates, o.source);
      pushHttp(candidates, o.image);
      pushHttp(candidates, o.thumbnail);
    }
  }

  pushHttp(candidates, row.original);
  const oi = row.original_image;
  if (oi && typeof oi === 'object') {
    pushHttp(candidates, (oi as { link?: string }).link);
  }

  pushHttp(candidates, row.serpapi_thumbnail);
  pushHttp(candidates, row.thumbnail);

  if (candidates.length === 0) return '';

  const uniq = [...new Set(candidates)];
  const best =
    uniq.sort((a, b) => imageUrlScore(b, row) - imageUrlScore(a, row))[0] ?? '';
  return upgradeGoogleImageSize(best);
}

/**
 * Many Google CDN thumbs use `=s64` / `=s128` size hints; bumping to a larger `=s`
 * improves sharpness on retina cards without changing host (still same origin rules).
 * Preserves suffixes like `-c` on `=s64-c`.
 */
export function upgradeGoogleImageSize(url: string): string {
  const t = url.trim();
  if (!t) return url;
  if (!t.includes('googleusercontent') && !t.includes('gstatic.com')) {
    return t;
  }
  return t.replace(
    /=s(\d{1,4})(-[a-z]+)?/gi,
    (match, numStr: string, suffix: string | undefined) => {
      const n = parseInt(numStr, 10);
      if (Number.isNaN(n) || n >= 480) return match;
      return `=s800${suffix ?? ''}`;
    },
  );
}
