/**
 * Prefer real product/hero images; deprioritize Amazon nav sprites, logos, tiny thumbs.
 */
export function scoreLinkPreviewHeroImageUrl(url: string): number {
  const h = url.toLowerCase();
  let s = 0;

  if (
    h.includes('/sprites/') ||
    h.includes('nav-sprite') ||
    h.includes('sprite-')
  ) {
    return -1000;
  }
  if (h.includes('favicon') || h.includes('1x1') || h.includes('pixel.gif')) {
    return -1000;
  }
  if (/_32x32|32x32|16x16|24x24/i.test(h)) {
    s -= 120;
  }
  if (/apple-touch|180x180|192x192|512x512/i.test(h)) {
    s += 90;
  }
  if (h.includes('/g/01/') && h.includes('amazon')) {
    s -= 450;
  }
  if ((h.includes('logo') || h.includes('brand')) && h.includes('amazon')) {
    s -= 350;
  }
  if (h.includes('media-amazon.com/images/i/')) {
    s += 220;
  }
  if (h.includes('ssl-images-amazon') && h.includes('/images/i/')) {
    s += 200;
  }
  if (/\._ac_sl\d+_/i.test(url)) {
    s += 100;
  }
  if (/\._ac_ul\d+_/i.test(url)) {
    s -= 130;
  }
  if (/\._ac_ss\d+_/i.test(url)) {
    s -= 50;
  }
  if (h.includes('og:image') || h.includes('/og/')) {
    s += 25;
  }
  if (h.includes('sprite') || h.includes('spacer')) {
    s -= 200;
  }
  return s;
}

export function pickBestLinkPreviewImageUrl(urls: string[]): string | null {
  const seen = new Set<string>();
  const unique = urls.filter((u) => {
    const t = u.trim();
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  if (!unique.length) return null;

  const scored = unique.map((u) => ({
    u,
    s: scoreLinkPreviewHeroImageUrl(u),
  }));
  scored.sort((a, b) => b.s - a.s);
  const best = scored[0];
  /** Reject only obvious junk (favicons, nav sprites). A score of 0 is normal for generic article/forum OG URLs — the old `< 8` gate hid most non-Amazon previews. */
  if (best.s <= -900) {
    return null;
  }
  return best.u;
}
