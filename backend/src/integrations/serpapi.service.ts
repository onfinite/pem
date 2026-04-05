import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { sortShoppingByPreferredRetailers } from './serp-shopping-prefer-retailers';
import {
  pickBestSerpImageUrl,
  upgradeGoogleImageSize,
} from './serpapi-image-url';
import {
  parseAmazonAsinQuery,
  parseFlightPipeQuery,
  deriveSerpRetryHint,
  parseHotelFlexibleQuery,
  parseImmersiveProductQuery,
  parseMapsReviewsQuery,
  simplifyQueryForGoogleLocal,
  simplifyToKeywords,
  extractLocationFromQuery,
} from './serpapi-query-parsers';

/** Parsed JSON from SerpAPI — includes engine-level errors in the body for HTTP 200. */
type SerpFetchFailure = { message: string; hint: string };

type SerpFetchResult = {
  data: Record<string, unknown> | null;
  failure?: SerpFetchFailure;
};

/** One normalized shopping row for the prep agent (from SerpAPI Google Shopping). */
export type SerpShoppingItem = {
  title: string;
  link: string;
  price: string;
  source: string;
  thumbnail: string;
  rating: number;
};

/** One normalized local / Maps row. */
export type SerpLocalItem = {
  title: string;
  address: string;
  rating: number;
  reviews: number;
  thumbnail: string;
  /** Google Maps place URL (`link` in SerpAPI JSON). */
  placeUrl: string;
  /** Business website when SerpAPI provides it (not the Maps URL). */
  website: string;
  phone: string;
  lat: number;
  lng: number;
  type: string;
};

/** Organic result line. */
export type SerpOrganicItem = {
  title: string;
  link: string;
  snippet: string;
};

/** Google News (tbm=nws). */
export type SerpNewsItem = {
  title: string;
  link: string;
  source: string;
  date: string;
  thumbnail: string;
  snippet: string;
};

/** Google Images. */
export type SerpImageItem = {
  title: string;
  link: string;
  source: string;
  thumbnail: string;
  original: string;
};

/** Google Jobs. */
export type SerpJobItem = {
  title: string;
  company: string;
  location: string;
  link: string;
  snippet: string;
};

/** Google Finance — best-effort snapshot for tickers / FX. */
export type SerpFinanceSnapshot = {
  title: string;
  price: string;
  change: string;
  currency: string;
};

/** Google Events — normalized row for agents. */
export type SerpEventRow = {
  title: string;
  when: string;
  address: string;
  link: string;
  thumbnail: string;
  venue: string;
};

/** Generic Serp row — forums, scholar, local, etc. */
export type SerpSimpleRow = {
  title: string;
  link: string;
  snippet: string;
  thumbnail: string;
};

/**
 * SerpAPI (Google Shopping, Maps, organic) — structured real-world data for agents.
 * See `pem-search-provider-routing.mdc`.
 */
@Injectable()
export class SerpApiService {
  private readonly log = new Logger(SerpApiService.name);

  constructor(private readonly config: ConfigService) {}

  hasKey(): boolean {
    return Boolean(this.config.get<string>('serpApi.apiKey')?.trim());
  }

  /**
   * SerpAPI returns JSON with `error` or `search_metadata.status: "Error"` even on HTTP 200.
   * See [SerpAPI engines](https://serpapi.com/search-engine-apis).
   */
  private extractSerpApiError(
    data: Record<string, unknown>,
  ): SerpFetchFailure | null {
    const sm = data.search_metadata as Record<string, unknown> | undefined;
    if (sm && typeof sm.status === 'string' && sm.status === 'Error') {
      const err = data.error;
      const msg =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object'
            ? JSON.stringify(err).slice(0, 500)
            : 'SerpAPI search_metadata.status is Error';
      return { message: msg.slice(0, 800), hint: deriveSerpRetryHint(msg) };
    }
    if (typeof data.error === 'string' && data.error.trim()) {
      const msg = data.error.trim();
      return { message: msg.slice(0, 800), hint: deriveSerpRetryHint(msg) };
    }
    return null;
  }

  private async fetchJson(
    params: Record<string, string>,
  ): Promise<SerpFetchResult> {
    const key = this.config.get<string>('serpApi.apiKey')?.trim();
    if (!key) {
      this.log.warn('SERP_API_KEY missing — SerpAPI call skipped');
      return { data: null };
    }
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('api_key', key);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') {
        url.searchParams.set(k, v);
      }
    }
    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(25_000),
      });
      const text = await res.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        this.log.warn(
          `SerpAPI non-JSON (${res.status}): ${text.slice(0, 200)}`,
        );
        return {
          data: null,
          failure: {
            message: `Invalid JSON (HTTP ${res.status})`,
            hint: deriveSerpRetryHint(text),
          },
        };
      }
      if (!res.ok) {
        const fromBody = this.extractSerpApiError(json);
        const base = `HTTP ${res.status}`;
        if (fromBody) {
          this.log.warn(`SerpAPI ${base}: ${fromBody.message}`);
          return {
            data: null,
            failure: {
              message: `${base}: ${fromBody.message}`,
              hint: fromBody.hint,
            },
          };
        }
        const msg =
          typeof json.error === 'string' ? json.error : text.slice(0, 400);
        this.log.warn(`SerpAPI ${base}: ${msg}`);
        return {
          data: null,
          failure: {
            message: `${base}: ${msg}`,
            hint: deriveSerpRetryHint(msg),
          },
        };
      }
      const fail = this.extractSerpApiError(json);
      if (fail) {
        this.log.warn(`SerpAPI engine error: ${fail.message}`);
        return { data: null, failure: fail };
      }
      return { data: json };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`SerpAPI fetch failed: ${msg}`);
      return {
        data: null,
        failure: { message: msg, hint: deriveSerpRetryHint(msg) },
      };
    }
  }

  /** Google Shopping — product cards with price, image, store link. */
  async googleShopping(query: string): Promise<SerpShoppingItem[]> {
    const q = query.slice(0, 400);
    const { data, failure } = await this.fetchJson({
      engine: 'google_shopping',
      q,
      num: '12',
    });
    if (failure) {
      this.log.warn(`google_shopping: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.shopping_results;
    if (!Array.isArray(raw)) return [];
    const out: SerpShoppingItem[] = [];
    for (const row of raw.slice(0, 12)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const link = typeof r.link === 'string' ? r.link : '';
      const price =
        typeof r.price === 'string'
          ? r.price
          : typeof r.extracted_price === 'number'
            ? String(r.extracted_price)
            : '';
      const source = typeof r.source === 'string' ? r.source : '';
      const thumbnail = pickBestSerpImageUrl(r);
      let rating = 0;
      if (typeof r.rating === 'number' && !Number.isNaN(r.rating)) {
        rating = Math.min(5, Math.max(0, r.rating));
      }
      if (title && link) {
        out.push({ title, link, price, source, thumbnail, rating });
      }
    }
    return sortShoppingByPreferredRetailers(out);
  }

  /**
   * Amazon product search — direct PDP links + thumbnails (SerpAPI `engine=amazon`).
   * Runs in parallel with Google Shopping for SHOPPING intent; see `prep-google-bundle.ts`.
   */
  async amazonSearch(query: string): Promise<SerpShoppingItem[]> {
    const k = query.slice(0, 400);
    const { data, failure } = await this.fetchJson({
      engine: 'amazon',
      k,
      amazon_domain: 'amazon.com',
    });
    if (failure) {
      this.log.warn(`amazon: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.organic_results;
    if (!Array.isArray(raw)) return [];
    const out: SerpShoppingItem[] = [];
    for (const row of raw.slice(0, 12)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const linkClean = typeof r.link_clean === 'string' ? r.link_clean : '';
      const linkRaw = typeof r.link === 'string' ? r.link : '';
      const link = linkClean.trim() || linkRaw.trim();
      let price = '';
      if (typeof r.price === 'string') {
        price = r.price;
      } else if (r.price && typeof r.price === 'object') {
        const p = r.price as Record<string, unknown>;
        if (typeof p.raw === 'string') price = p.raw;
        else if (typeof p.extracted_value === 'number') {
          price = String(p.extracted_value);
        }
      }
      if (typeof r.extracted_price === 'number' && !price) {
        price = String(r.extracted_price);
      }
      const thumbnail = pickBestSerpImageUrl(r);
      let rating = 0;
      if (typeof r.rating === 'number' && !Number.isNaN(r.rating)) {
        rating = Math.min(5, Math.max(0, r.rating));
      }
      const isProductPdp =
        /\/dp\/[A-Z0-9]/i.test(link) || /\/gp\/product\//i.test(link);
      if (title && link && link.includes('amazon.') && isProductPdp) {
        out.push({
          title,
          link,
          price,
          source: 'Amazon',
          thumbnail,
          rating,
        });
      }
    }
    return out;
  }

  /**
   * @deprecated Use {@link googleLocal} instead — `google_maps` has been removed.
   * Kept only as an alias so callers compile; routes to `google_local`.
   */
  async googleMaps(
    query: string,
    location?: { latitude: number; longitude: number },
  ): Promise<SerpLocalItem[]> {
    return this.googleLocal(query, location);
  }

  /** Google organic web search — knowledge panel / LinkedIn discovery, news. */
  async googleOrganic(
    query: string,
    opts?: { pastMonth?: boolean },
  ): Promise<SerpOrganicItem[]> {
    const q = query.slice(0, 400);
    const params: Record<string, string> = {
      engine: 'google',
      q,
      num: '10',
    };
    if (opts?.pastMonth) {
      params.tbs = 'qdr:m';
    }
    const { data, failure } = await this.fetchJson(params);
    if (failure) {
      this.log.warn(`google_organic: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.organic_results;
    if (!Array.isArray(raw)) return [];
    const out: SerpOrganicItem[] = [];
    for (const row of raw.slice(0, 10)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const link = typeof r.link === 'string' ? r.link : '';
      const snippet = typeof r.snippet === 'string' ? r.snippet : '';
      if (title && link) {
        out.push({ title, link, snippet });
      }
    }
    return out;
  }

  /** Google News — `tbm=nws` + recency filter. */
  async googleNews(
    query: string,
    opts?: { period?: 'd' | 'w' | 'm' },
  ): Promise<SerpNewsItem[]> {
    const q = query.slice(0, 400);
    const tbs =
      opts?.period === 'd' ? 'qdr:d' : opts?.period === 'm' ? 'qdr:m' : 'qdr:w';
    const { data, failure } = await this.fetchJson({
      engine: 'google',
      q,
      tbm: 'nws',
      tbs,
      num: '10',
    });
    if (failure) {
      this.log.warn(`google_news (tbm=nws): ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.news_results;
    if (!Array.isArray(raw)) return [];
    const out: SerpNewsItem[] = [];
    for (const row of raw.slice(0, 10)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const link = typeof r.link === 'string' ? r.link : '';
      const source =
        typeof r.source === 'string'
          ? r.source
          : typeof r.source === 'object' &&
              r.source &&
              typeof (r.source as { name?: string }).name === 'string'
            ? (r.source as { name: string }).name
            : '';
      const date = typeof r.date === 'string' ? r.date : '';
      const thumbnail = pickBestSerpImageUrl(r);
      const snippet = typeof r.snippet === 'string' ? r.snippet : '';
      if (title && link) {
        out.push({ title, link, source, date, thumbnail, snippet });
      }
    }
    return out;
  }

  /** Google Images — thumbnails + originals for image search / reference. */
  async googleImages(query: string): Promise<SerpImageItem[]> {
    const q = query.slice(0, 400);
    const { data, failure } = await this.fetchJson({
      engine: 'google_images',
      q,
      num: '20',
    });
    if (failure) {
      this.log.warn(`google_images: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.images_results;
    if (!Array.isArray(raw)) return [];
    const out: SerpImageItem[] = [];
    for (const row of raw.slice(0, 20)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const link = typeof r.link === 'string' ? r.link : '';
      const source = typeof r.source === 'string' ? r.source : '';
      const thumbnail = pickBestSerpImageUrl(r);
      const origImg = r.original_image as { link?: string } | undefined;
      const rawOrig =
        (typeof r.original === 'string' ? r.original.trim() : '') ||
        (typeof origImg?.link === 'string' ? origImg.link.trim() : '');
      const original = rawOrig ? upgradeGoogleImageSize(rawOrig) : thumbnail;
      if (title && (link || thumbnail)) {
        out.push({ title, link, source, thumbnail, original });
      }
    }
    return out;
  }

  /** Google Jobs — structured listings. */
  async googleJobs(query: string, location?: string): Promise<SerpJobItem[]> {
    const q = query.slice(0, 400);
    const params: Record<string, string> = {
      engine: 'google_jobs',
      q,
    };
    const loc = location?.trim();
    if (loc) {
      params.location = loc.slice(0, 120);
    }
    const { data, failure } = await this.fetchJson(params);
    if (failure) {
      this.log.warn(`google_jobs: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.jobs_results;
    if (!Array.isArray(raw)) return [];
    const out: SerpJobItem[] = [];
    for (const row of raw.slice(0, 10)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const company = typeof r.company_name === 'string' ? r.company_name : '';
      const locStr = typeof r.location === 'string' ? r.location : '';
      let link = '';
      if (typeof r.link === 'string') {
        link = r.link;
      } else if (Array.isArray(r.apply_options) && r.apply_options[0]) {
        const ao = r.apply_options[0] as { link?: string };
        if (typeof ao.link === 'string') {
          link = ao.link;
        }
      }
      let snippet = '';
      if (typeof r.description === 'string') {
        snippet = r.description.slice(0, 400);
      }
      if (title && (link || company)) {
        out.push({
          title,
          company,
          location: locStr,
          link: link || '',
          snippet,
        });
      }
    }
    return out;
  }

  /** Google Finance — ticker / instrument snapshot (shape varies by instrument). */
  async googleFinance(query: string): Promise<SerpFinanceSnapshot | null> {
    const q = query.slice(0, 120);
    const { data, failure } = await this.fetchJson({
      engine: 'google_finance',
      q,
    });
    if (failure) {
      this.log.warn(`google_finance: ${failure.message}`);
    }
    if (!data) return null;
    const summary = data.summary as Record<string, unknown> | undefined;
    if (!summary || typeof summary !== 'object') {
      const si = data.search_information as { query?: string } | undefined;
      return {
        title: typeof si?.query === 'string' ? si.query : q,
        price: '',
        change: '',
        currency: 'USD',
      };
    }
    const title =
      typeof summary.title === 'string'
        ? summary.title
        : typeof summary.name === 'string'
          ? summary.name
          : q;
    let price = '';
    if (typeof summary.price === 'string') {
      price = summary.price;
    } else if (summary.price && typeof summary.price === 'object') {
      const p = summary.price as Record<string, unknown>;
      if (typeof p.value === 'number') {
        price = String(p.value);
      }
    }
    const pm = summary.price_movement as { percentage?: number } | undefined;
    const change =
      pm && typeof pm.percentage === 'number'
        ? `${pm.percentage >= 0 ? '+' : ''}${pm.percentage.toFixed(2)}%`
        : typeof summary.price_change === 'string'
          ? summary.price_change
          : '';
    const currency =
      typeof summary.currency === 'string' ? summary.currency : 'USD';
    return { title, price, change, currency };
  }

  /** Google Events — concerts, festivals, local happenings (`engine=google_events`). */
  async googleEvents(
    query: string,
    opts?: { location?: string; htichips?: string },
  ): Promise<SerpEventRow[]> {
    const q = query.slice(0, 400);
    const params: Record<string, string> = {
      engine: 'google_events',
      q,
    };
    const loc = opts?.location?.trim();
    if (loc) params.location = loc.slice(0, 120);
    const chips = opts?.htichips?.trim();
    if (chips) params.htichips = chips.slice(0, 200);
    const { data, failure } = await this.fetchJson(params);
    if (failure) {
      this.log.warn(`google_events: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.events_results;
    if (!Array.isArray(raw)) return [];
    const out: SerpEventRow[] = [];
    for (const row of raw.slice(0, 15)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const link = typeof r.link === 'string' ? r.link : '';
      let when = '';
      if (r.date && typeof r.date === 'object') {
        const d = r.date as Record<string, unknown>;
        when =
          typeof d.when === 'string'
            ? d.when
            : typeof d.start_date === 'string'
              ? d.start_date
              : '';
      }
      let address = '';
      if (Array.isArray(r.address)) {
        address = r.address
          .filter((x): x is string => typeof x === 'string')
          .join(', ');
      } else if (typeof r.address === 'string') {
        address = r.address;
      }
      const thumbnail = pickBestSerpImageUrl(r);
      let venue = '';
      if (typeof r.venue === 'string') {
        venue = r.venue;
      } else if (r.venue && typeof r.venue === 'object') {
        const v = r.venue as { name?: string };
        if (typeof v.name === 'string') venue = v.name;
      }
      if (title) {
        out.push({ title, when, address, link, thumbnail, venue });
      }
    }
    return out;
  }

  /**
   * Google Flights — use query `flight|DEP|ARR|YYYY-MM-DD` (see `serpapi-query-parsers.ts`).
   * Without that format, returns [] (agent must use the pipe format).
   */
  async googleFlights(query: string): Promise<Record<string, unknown> | null> {
    const parsed = parseFlightPipeQuery(query);
    if (!parsed) {
      this.log.debug(
        'google_flights: expected query flight|DEP|ARR|YYYY-MM-DD (e.g. flight|AUS|SFO|2026-06-15)',
      );
      return {
        serp_error:
          'Google Flights requires the pipe format in the query argument.',
        serp_retry_hint:
          'flight|DEP_IATA|ARR_IATA|YYYY-MM-DD (e.g. flight|AUS|SFO|2026-06-15)',
        best_flights: [],
        other_flights: [],
        price_insights: null,
        search_parameters: null,
      };
    }
    const params: Record<string, string> = {
      engine: 'google_flights',
      departure_id: parsed.departure_id,
      arrival_id: parsed.arrival_id,
      outbound_date: parsed.outbound_date,
      type: parsed.type,
      currency: 'USD',
    };
    const { data, failure } = await this.fetchJson(params);
    if (failure) {
      return {
        serp_error: failure.message,
        serp_retry_hint: failure.hint,
        best_flights: [],
        other_flights: [],
        price_insights: null,
        search_parameters: null,
      };
    }
    if (!data) return null;
    const best = data.best_flights;
    const other = data.other_flights;
    return {
      best_flights: Array.isArray(best) ? best.slice(0, 8) : [],
      other_flights: Array.isArray(other) ? other.slice(0, 5) : [],
      price_insights: data.price_insights ?? null,
      search_parameters: data.search_parameters ?? null,
    };
  }

  /**
   * Google Hotels — see [SerpAPI Google Hotels](https://serpapi.com/google-hotels-api).
   * Best: `hotel|city or name|check_in|check_out` (YYYY-MM-DD). Also accepts two ISO dates
   * in free text, or infers default dates (+14d / +2 nights) when only a place string is given.
   */
  async googleHotels(query: string): Promise<Record<string, unknown> | null> {
    const parsed = parseHotelFlexibleQuery(query);
    if (!parsed) {
      this.log.warn('google_hotels: empty query');
      return null;
    }
    this.log.debug(
      `google_hotels: q="${parsed.q.slice(0, 80)}" check_in=${parsed.check_in} check_out=${parsed.check_out} (raw="${query.slice(0, 80)}")`,
    );
    const { data, failure } = await this.fetchJson({
      engine: 'google_hotels',
      q: parsed.q.slice(0, 400),
      check_in_date: parsed.check_in,
      check_out_date: parsed.check_out,
      gl: 'us',
      hl: 'en',
      currency: 'USD',
    });
    if (failure) {
      return {
        serp_error: failure.message,
        serp_retry_hint: failure.hint,
        properties: [],
        search_parameters: null,
      };
    }
    if (!data) return null;
    const props = data.properties;
    return {
      properties: Array.isArray(props) ? props.slice(0, 15) : [],
      search_parameters: data.search_parameters ?? null,
    };
  }

  /** Discussions & forums (`engine=google_forums`). */
  async googleForums(query: string): Promise<SerpSimpleRow[]> {
    const q = query.slice(0, 400);
    const { data, failure } = await this.fetchJson({
      engine: 'google_forums',
      q,
    });
    if (failure) {
      this.log.warn(`google_forums: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.discussions_and_forums;
    if (!Array.isArray(raw)) return [];
    return this.mapSimpleRows(raw.slice(0, 12));
  }

  /** Faster image search (`engine=google_images_light`). */
  async googleImagesLight(query: string): Promise<SerpImageItem[]> {
    const q = query.slice(0, 400);
    const { data, failure } = await this.fetchJson({
      engine: 'google_images_light',
      q,
      num: '20',
    });
    if (failure) {
      this.log.warn(`google_images_light: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.images_results;
    if (!Array.isArray(raw)) return [];
    return this.parseImagesResults(raw.slice(0, 20));
  }

  /** Google Maps Reviews — query `reviews|DATA_ID`. */
  async googleMapsReviews(
    query: string,
  ): Promise<Record<string, unknown> | null> {
    const dataId = parseMapsReviewsQuery(query);
    if (!dataId) {
      this.log.warn('google_maps_reviews: use query reviews|DATA_ID');
      return {
        serp_error:
          'google_maps_reviews requires reviews|DATA_ID from a Maps place.',
        serp_retry_hint:
          'Call maps first, then use reviews|DATA_ID from a result.',
        reviews: [],
        place_info: null,
      };
    }
    const { data, failure } = await this.fetchJson({
      engine: 'google_maps_reviews',
      data_id: dataId,
    });
    if (failure) {
      return {
        serp_error: failure.message,
        serp_retry_hint: failure.hint,
        reviews: [],
        place_info: null,
      };
    }
    if (!data) return null;
    const revs = data.reviews;
    return {
      reviews: Array.isArray(revs) ? revs.slice(0, 25) : [],
      place_info: data.place_info ?? null,
    };
  }

  /** Google Local (`engine=google_local`). */
  async googleLocal(
    query: string,
    location?: { latitude: number; longitude: number },
  ): Promise<SerpLocalItem[]> {
    const q = simplifyToKeywords(query).slice(0, 400);
    this.log.debug(`google_local: q="${q}" (raw="${query.slice(0, 80)}")`);
    const params: Record<string, string> = {
      engine: 'google_local',
      q,
      hl: 'en',
      gl: 'us',
    };
    const textLocation = extractLocationFromQuery(q);
    if (textLocation) {
      params.location = textLocation;
    }
    if (location) {
      params.ll = `@${location.latitude},${location.longitude},14z`;
    }
    let { data, failure } = await this.fetchJson(params);
    if (failure && textLocation && failure.message.includes('location')) {
      this.log.warn(
        `google_local: location "${textLocation}" rejected, retrying without`,
      );
      delete params.location;
      ({ data, failure } = await this.fetchJson(params));
    }
    if (failure) {
      this.log.warn(`google_local: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.local_results;
    if (!Array.isArray(raw)) return [];
    return this.mapLocalResultsRows(raw.slice(0, 12));
  }

  /**
   * “Local services” vertical for the agent bundle — implemented with **`google_local`**
   * (Maps local pack), not SerpAPI’s `google_local_services` engine.
   *
   * SerpAPI’s [Google Local Services API](https://serpapi.com/google-local-services-api)
   * requires **`data_cid`** (geographic Google CID) plus **`q` from Google’s fixed service list**
   * (e.g. `electrician`) — not free text like “movers Fremont”. Passing only `q` + `ll`
   * yields HTTP 400 “Unsupported `q` parameter.”
   *
   * Until we resolve city → `data_cid` and map asks to allowlisted service names, use
   * **`google_local`**, which accepts normal local search queries and `ll`.
   */
  async googleLocalServices(
    query: string,
    location?: { latitude: number; longitude: number },
  ): Promise<SerpSimpleRow[]> {
    const local = await this.googleLocal(
      simplifyQueryForGoogleLocal(query),
      location,
    );
    return this.mapLocalItemsToSimpleRows(local);
  }

  /** Align google_local rows with SerpSimpleRow for bundle JSON shape. */
  private mapLocalItemsToSimpleRows(items: SerpLocalItem[]): SerpSimpleRow[] {
    return items.map((i) => ({
      title: i.title,
      link: i.placeUrl || i.website || '',
      snippet: [i.address, i.type].filter(Boolean).join(' · ') || i.title,
      thumbnail: i.thumbnail,
    }));
  }

  /** Travel Explore — inspiration / destinations (`engine=google_travel_explore`). */
  async googleTravelExplore(
    query: string,
  ): Promise<Record<string, unknown> | null> {
    const q = query.slice(0, 400);
    const { data, failure } = await this.fetchJson({
      engine: 'google_travel_explore',
      q,
      gl: 'us',
    });
    if (failure) {
      return {
        serp_error: failure.message,
        serp_retry_hint: failure.hint,
        destinations: [],
        discover_more: [],
        search_parameters: null,
      };
    }
    if (!data) return null;
    return {
      destinations: data.destinations ?? data.top_destinations ?? [],
      discover_more: data.discover_more_destinations ?? [],
      search_parameters: data.search_parameters ?? null,
    };
  }

  /** Google Trends — interest over time + related (`engine=google_trends`). */
  async googleTrends(query: string): Promise<Record<string, unknown> | null> {
    const q = query.slice(0, 100);
    const { data, failure } = await this.fetchJson({
      engine: 'google_trends',
      q,
    });
    if (failure) {
      return {
        serp_error: failure.message,
        serp_retry_hint: failure.hint,
        interest_over_time: null,
        related_queries: null,
        related_topics: null,
      };
    }
    if (!data) return null;
    return {
      interest_over_time: data.interest_over_time ?? null,
      related_queries: data.related_queries ?? null,
      related_topics: data.related_topics ?? null,
    };
  }

  /** Immersive Product — query `product|PAGE_TOKEN` from Shopping JSON. */
  async googleImmersiveProduct(
    query: string,
  ): Promise<Record<string, unknown> | null> {
    const token = parseImmersiveProductQuery(query);
    if (!token) {
      this.log.warn('google_immersive_product: use query product|PAGE_TOKEN');
      return {
        serp_error:
          'immersive_product requires product|PAGE_TOKEN from a google_shopping result.',
        serp_retry_hint:
          'Use product|PAGE_TOKEN — copy PAGE_TOKEN from shopping JSON.',
        immersive_product: null,
      };
    }
    const { data, failure } = await this.fetchJson({
      engine: 'google_immersive_product',
      page_token: token,
    });
    if (failure) {
      return {
        serp_error: failure.message,
        serp_retry_hint: failure.hint,
        immersive_product: null,
      };
    }
    if (!data) return null;
    return { immersive_product: data.immersive_product ?? data };
  }

  /** Amazon PDP scrape (`engine=amazon_product`) — query raw ASIN or `asin|B0...`. */
  async amazonProduct(query: string): Promise<Record<string, unknown> | null> {
    const asin = parseAmazonAsinQuery(query);
    if (!asin) {
      this.log.warn('amazon_product: pass ASIN or asin|B0XXXXXXXX');
      return {
        serp_error: 'amazon_product needs a valid ASIN or asin|B0XXXXXXXX.',
        serp_retry_hint:
          'Pass the product ASIN or asin|B0XXXXXXXX in the query.',
        product_results: null,
        search_parameters: null,
      };
    }
    const { data, failure } = await this.fetchJson({
      engine: 'amazon_product',
      asin,
      amazon_domain: 'amazon.com',
    });
    if (failure) {
      return {
        serp_error: failure.message,
        serp_retry_hint: failure.hint,
        product_results: null,
        search_parameters: null,
      };
    }
    if (!data) return null;
    return {
      product_results: data.product_results ?? data,
      search_parameters: data.search_parameters ?? null,
    };
  }

  /** Apple App Store search (`engine=apple_app_store`). */
  async appleAppStore(query: string): Promise<SerpSimpleRow[]> {
    const term = query.slice(0, 200);
    const { data, failure } = await this.fetchJson({
      engine: 'apple_app_store',
      term,
      country: 'us',
    });
    if (failure) {
      this.log.warn(`apple_app_store: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.organic_results;
    if (!Array.isArray(raw)) return [];
    return this.mapSimpleRows(raw.slice(0, 15));
  }

  /** Home Depot product search (`engine=home_depot`). */
  async homeDepot(query: string): Promise<SerpSimpleRow[]> {
    const q = query.slice(0, 400);
    const { data, failure } = await this.fetchJson({
      engine: 'home_depot',
      q,
    });
    if (failure) {
      this.log.warn(`home_depot: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.products ?? data.organic_results;
    if (!Array.isArray(raw)) return [];
    return this.mapSimpleRows(raw.slice(0, 15));
  }

  /** Facebook profile / page (`engine=facebook_profile`) — pass profile id or slug in query. */
  async facebookProfile(
    query: string,
  ): Promise<Record<string, unknown> | null> {
    const profile_id = query.trim().slice(0, 200);
    if (!profile_id) return null;
    const { data, failure } = await this.fetchJson({
      engine: 'facebook_profile',
      profile_id,
    });
    if (failure) {
      return {
        serp_error: failure.message,
        serp_retry_hint: failure.hint,
        facebook_profile: null,
      };
    }
    if (!data) return null;
    return { facebook_profile: data };
  }

  /** Google Scholar (`engine=google_scholar`) — academic papers. */
  async googleScholar(query: string): Promise<SerpSimpleRow[]> {
    const q = query.slice(0, 400);
    const { data, failure } = await this.fetchJson({
      engine: 'google_scholar',
      q,
    });
    if (failure) {
      this.log.warn(`google_scholar: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.organic_results;
    if (!Array.isArray(raw)) return [];
    return this.mapSimpleRows(raw.slice(0, 12));
  }

  /** Dedicated Google News engine (`engine=google_news`). */
  async googleNewsEngine(query: string): Promise<SerpNewsItem[]> {
    const q = query.slice(0, 400);
    const { data, failure } = await this.fetchJson({
      engine: 'google_news',
      q,
      gl: 'us',
      hl: 'en',
    });
    if (failure) {
      this.log.warn(`google_news: ${failure.message}`);
    }
    if (!data) return [];
    const raw = data.news_results;
    if (!Array.isArray(raw)) return [];
    const out: SerpNewsItem[] = [];
    for (const row of raw.slice(0, 12)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const link = typeof r.link === 'string' ? r.link : '';
      const source =
        typeof r.source === 'string'
          ? r.source
          : r.source && typeof r.source === 'object'
            ? String((r.source as { name?: string }).name ?? '')
            : '';
      const date = typeof r.date === 'string' ? r.date : '';
      const thumbnail = pickBestSerpImageUrl(r);
      const snippet = typeof r.snippet === 'string' ? r.snippet : '';
      if (title && link) {
        out.push({ title, link, source, date, thumbnail, snippet });
      }
    }
    return out;
  }

  private mapSimpleRows(raw: unknown[]): SerpSimpleRow[] {
    const out: SerpSimpleRow[] = [];
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const link =
        typeof r.link === 'string'
          ? r.link
          : typeof r.link === 'object' && r.link
            ? String((r.link as { link?: string }).link ?? '')
            : '';
      const snippet =
        typeof r.snippet === 'string'
          ? r.snippet
          : typeof r.description === 'string'
            ? r.description.slice(0, 400)
            : '';
      const thumbnail = pickBestSerpImageUrl(r);
      if (title && link) {
        out.push({ title, link, snippet, thumbnail });
      }
    }
    return out;
  }

  private parseImagesResults(raw: unknown[]): SerpImageItem[] {
    const out: SerpImageItem[] = [];
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const link = typeof r.link === 'string' ? r.link : '';
      const source = typeof r.source === 'string' ? r.source : '';
      const thumbnail = pickBestSerpImageUrl(r);
      const origImg = r.original_image as { link?: string } | undefined;
      const rawOrig =
        (typeof r.original === 'string' ? r.original.trim() : '') ||
        (typeof origImg?.link === 'string' ? origImg.link.trim() : '');
      const original = rawOrig ? upgradeGoogleImageSize(rawOrig) : thumbnail;
      if (title && (link || thumbnail)) {
        out.push({ title, link, source, thumbnail, original });
      }
    }
    return out;
  }

  private mapLocalResultsRows(raw: unknown[]): SerpLocalItem[] {
    const out: SerpLocalItem[] = [];
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title : '';
      const address = typeof r.address === 'string' ? r.address : '';
      const placeUrl = typeof r.link === 'string' ? r.link : '';
      const website = typeof r.website === 'string' ? r.website.trim() : '';
      const phone = typeof r.phone === 'string' ? r.phone.trim() : '';
      const thumbnail = pickBestSerpImageUrl(r);
      const type = typeof r.type === 'string' ? r.type : '';
      let rating = 0;
      let reviews = 0;
      if (typeof r.rating === 'number' && !Number.isNaN(r.rating)) {
        rating = Math.min(5, Math.max(0, r.rating));
      }
      if (typeof r.reviews === 'number' && !Number.isNaN(r.reviews)) {
        reviews = Math.max(0, Math.floor(r.reviews));
      }
      const gps = r.gps_coordinates as
        | { latitude?: number; longitude?: number }
        | undefined;
      let lat = 0;
      let lng = 0;
      if (
        gps &&
        typeof gps.latitude === 'number' &&
        typeof gps.longitude === 'number'
      ) {
        lat = gps.latitude;
        lng = gps.longitude;
      }
      if (title) {
        out.push({
          title,
          address,
          rating,
          reviews,
          thumbnail,
          placeUrl,
          website,
          phone,
          lat,
          lng,
          type,
        });
      }
    }
    return out;
  }
}
