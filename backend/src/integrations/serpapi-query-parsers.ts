/**
 * Parses `google()` query strings for engines that need structured params
 * beyond a single search phrase. The agent passes these formats in `query`.
 */

/** `flight|DEP|ARR|YYYY-MM-DD` e.g. `flight|AUS|SFO|2026-06-15` (one-way). */
export function parseFlightPipeQuery(q: string): {
  departure_id: string;
  arrival_id: string;
  outbound_date: string;
  /** 1 round, 2 one-way (SerpAPI) */
  type: '1' | '2';
} | null {
  const s = q.trim();
  if (!s.toLowerCase().startsWith('flight|')) return null;
  const parts = s
    .slice(7)
    .split('|')
    .map((x) => x.trim());
  if (parts.length < 3) return null;
  const [dep, arr, date] = parts;
  if (!dep || !arr || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    departure_id: dep.toUpperCase(),
    arrival_id: arr.toUpperCase(),
    outbound_date: date,
    type: '2',
  };
}

/** `hotel|CITY_OR_QUERY|check_in|check_out` e.g. `hotel|Austin TX|2026-06-01|2026-06-03` */
export function parseHotelPipeQuery(q: string): {
  q: string;
  check_in: string;
  check_out: string;
} | null {
  const s = q.trim();
  if (!s.toLowerCase().startsWith('hotel|')) return null;
  const parts = s
    .slice(6)
    .split('|')
    .map((x) => x.trim());
  if (parts.length < 3) return null;
  const [hq, cin, cout] = parts;
  if (
    !hq ||
    !/^\d{4}-\d{2}-\d{2}$/.test(cin) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(cout)
  )
    return null;
  return { q: hq, check_in: cin, check_out: cout };
}

/** `reviews|DATA_ID` — Google Maps `data_id` for google_maps_reviews. */
export function parseMapsReviewsQuery(q: string): string | null {
  const s = q.trim();
  if (!s.toLowerCase().startsWith('reviews|')) return null;
  const id = s.slice(8).trim();
  return id.length > 0 ? id : null;
}

/** `asin|B0XXXXXXXX` or raw ASIN. */
export function parseAmazonAsinQuery(q: string): string | null {
  const s = q.trim();
  const m = s.match(/\b(B[0-9A-Z]{9})\b/i);
  if (m) return m[1].toUpperCase();
  if (s.toLowerCase().startsWith('asin|')) {
    const rest = s.slice(5).trim();
    return rest.length > 0 ? rest : null;
  }
  return null;
}

/** `product|PAGE_TOKEN` — SerpAPI immersive product page_token from Shopping. */
export function parseImmersiveProductQuery(q: string): string | null {
  const s = q.trim();
  if (!s.toLowerCase().startsWith('product|')) return null;
  const t = s.slice(8).trim();
  return t.length > 0 ? t : null;
}
