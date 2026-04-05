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

/**
 * SerpAPI [Google Hotels](https://serpapi.com/google-hotels-api) accepts `q` plus
 * `check_in_date` / `check_out_date`. Prefer {@link parseHotelPipeQuery}; this adds:
 * - any two **YYYY-MM-DD** dates in the string (search text is the rest), or
 * - **fallback:** full string as `q` with default check-in +2 weeks UTC and 2-night stay.
 */
export function parseHotelFlexibleQuery(q: string): {
  q: string;
  check_in: string;
  check_out: string;
} | null {
  const pipe = parseHotelPipeQuery(q);
  if (pipe) return pipe;

  const s = q.trim();
  if (!s) return null;

  const dateRe = /\b(\d{4}-\d{2}-\d{2})\b/g;
  const dates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = dateRe.exec(s)) !== null) {
    dates.push(m[1]);
  }
  if (dates.length >= 2) {
    let cin = dates[0];
    let cout = dates[1];
    if (cin > cout) [cin, cout] = [cout, cin];
    if (cin === cout) {
      const d = new Date(`${cin}T12:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      cout = d.toISOString().slice(0, 10);
    }
    let qText = s;
    for (const day of new Set(dates)) {
      qText = qText.replace(new RegExp(`\\b${day}\\b`, 'g'), ' ');
    }
    qText = simplifyToKeywords(qText).slice(0, 400);
    if (!qText) qText = 'hotels';
    return { q: qText, check_in: cin, check_out: cout };
  }

  const d0 = new Date();
  d0.setUTCDate(d0.getUTCDate() + 14);
  const d1 = new Date(d0);
  d1.setUTCDate(d1.getUTCDate() + 2);
  return {
    q: simplifyToKeywords(s).slice(0, 400),
    check_in: d0.toISOString().slice(0, 10),
    check_out: d1.toISOString().slice(0, 10),
  };
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

/**
 * Strip noise for `google_local` (Maps local pack) — accepts normal search phrases.
 * Not used for `google_local_services` (see SerpApiService.googleLocalServices).
 */
export function simplifyQueryForGoogleLocal(raw: string): string {
  return stripMovingNoise(raw).slice(0, 400);
}

/**
 * Reduce an agent's natural-language query to short keywords for SerpAPI engines
 * that don't handle full sentences well (google_hotels, google_local).
 *
 * Removes filler phrases like "find me", "I need", "or short-term rentals",
 * temporal noise, and excessive whitespace — keeps location names and topics.
 */
export function simplifyToKeywords(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  s = s.replace(
    /\b(find me|find|search for|search|look up|I need to|I need|I want to|I want|show me|can you|please|help me find|help me|looking for|plan the|planning|plan|the move|move from|moving from|moving to)\b/gi,
    '',
  );
  s = s.replace(/\bor\s+[\w-]+\b/gi, '');
  s = s.replace(
    /\b(best|top rated|good|great|affordable|cheap|that are|which are|reliable|some)\b/gi,
    '',
  );
  /** "X to Y" (two cities) — keep only the destination (last city) for maps/local. */
  s = s.replace(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    '$2',
  );
  s = stripMovingNoise(s);
  s = s.replace(/[.,;!?]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length < 3) return raw.trim().slice(0, 120);
  return s.slice(0, 200);
}

/**
 * Maps SerpAPI / HTTP error text to a short hint for the agent to fix `google()` query and retry.
 * See [SerpAPI search engines](https://serpapi.com/search-engine-apis).
 */
export function deriveSerpRetryHint(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes('check_in') ||
    m.includes('check-in') ||
    m.includes('check out') ||
    m.includes('checkout') ||
    m.includes('google_hotels')
  ) {
    return 'Use hotel|City or area|YYYY-MM-DD|YYYY-MM-DD, or put two ISO dates in the query; SerpAPI requires check_in_date and check_out_date.';
  }
  if (
    m.includes('departure') ||
    m.includes('arrival') ||
    m.includes('google_flights') ||
    m.includes('outbound')
  ) {
    return 'Use flight|DEP_IATA|ARR_IATA|YYYY-MM-DD (one-way). Example: flight|AUS|SFO|2026-06-15';
  }
  if (m.includes('data_id') || m.includes('maps_reviews')) {
    return 'maps_reviews needs reviews|DATA_ID from a Google Maps place result.';
  }
  if (m.includes('page_token') || m.includes('immersive')) {
    return 'immersive_product needs product|PAGE_TOKEN from a google_shopping result.';
  }
  if (m.includes('asin')) {
    return 'amazon_product needs a valid ASIN or asin|B0XXXXXXXX.';
  }
  if (m.includes('unsupported') && m.includes('q')) {
    return 'This engine may need a different query shape — check SerpAPI docs for this engine.';
  }
  return 'Adjust the query per SerpAPI docs for this vertical and call google() again.';
}

const STATE_ABBR_TO_FULL: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

/**
 * Extract a US city/state location string from a query for the SerpAPI `location`
 * parameter. SerpAPI requires full state names (e.g. "Fremont, California, United States").
 * Returns null if no recognizable location pattern is found.
 */
export function extractLocationFromQuery(q: string): string | null {
  const abbrKeys = Object.keys(STATE_ABBR_TO_FULL).join('|');
  const stateAbbr = new RegExp(
    `\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*),?\\s+(${abbrKeys})\\b`,
  );
  const m = q.match(stateAbbr);
  if (m) {
    const fullState = STATE_ABBR_TO_FULL[m[2]] ?? m[2];
    return `${m[1]}, ${fullState}, United States`;
  }
  const fullStateNames = Object.values(STATE_ABBR_TO_FULL).join('|');
  const fullState = new RegExp(
    `\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*),?\\s+(${fullStateNames})\\b`,
  );
  const fm = q.match(fullState);
  if (fm) return `${fm[1]}, ${fm[2]}, United States`;
  return null;
}

function stripMovingNoise(s: string): string {
  let x = s.trim().replace(/\s+/g, ' ');
  x = x.replace(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b\.?\s*\d{0,4}\b/gi,
    '',
  );
  x = x.replace(/\b20\d{2}\b/g, '');
  x = x.replace(/\bthis month\b|\bnext month\b/gi, '');
  x = x.replace(/\bmoving services\b/gi, 'movers');
  x = x.replace(/\s+/g, ' ').trim();
  return x;
}
