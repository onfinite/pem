/**
 * URL classification for place/business cards — no React Native imports (safe for Vitest).
 */

export function isLikelyMapsHttpUrl(url: string): boolean {
  const raw = url.trim().toLowerCase();
  if (!raw.startsWith("http")) return false;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host === "maps.apple.com") return true;
    if (host === "maps.app.goo.gl" || host === "goo.gl") return true;
    if (host.endsWith("apple.com") && path.includes("/maps")) return true;
    if (host.startsWith("maps.google.")) return true;
    if (host === "google.com" || host.endsWith(".google.com")) {
      if (path.startsWith("/maps")) return true;
    }
    return false;
  } catch {
    return (
      raw.includes("maps.google.") ||
      raw.includes("google.com/maps") ||
      raw.includes("goo.gl/maps") ||
      raw.includes("maps.app.goo.gl") ||
      raw.includes("maps.apple.com")
    );
  }
}

/** Prefer native map when we have coords, or when `url` is empty / not a plain website link. */
export function shouldOpenPlaceRowAsMap(params: {
  lat: number;
  lng: number;
  urlTrimmed: string;
}): boolean {
  if (params.lat !== 0 && params.lng !== 0) return true;
  const u = params.urlTrimmed;
  if (!u) return true;
  if (!/^https?:\/\//i.test(u)) return true;
  return isLikelyMapsHttpUrl(u);
}

export function labelForPlaceRowAction(params: {
  lat: number;
  lng: number;
  urlTrimmed: string;
}): "Map" | "Website" {
  return shouldOpenPlaceRowAsMap(params) ? "Map" : "Website";
}

/** BUSINESS_CARD `mapsUrl` — may be a real Maps link or a site the model misfiled here. */
export function labelForBusinessMapsUrl(mapsUrl: string): "Map" | "Website" {
  const u = mapsUrl.trim();
  if (!u) return "Website";
  return isLikelyMapsHttpUrl(u) ? "Map" : "Website";
}
