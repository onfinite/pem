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
  parseHotelPipeQuery,
  parseImmersiveProductQuery,
  parseMapsReviewsQuery,
} from './serpapi-query-parsers';

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

  private async fetchJson(
    params: Record<string, string>,
  ): Promise<Record<string, unknown> | null> {
    const key = this.config.get<string>('serpApi.apiKey')?.trim();
    if (!key) {
      this.log.warn('SERP_API_KEY missing — SerpAPI call skipped');
      return null;
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
      if (!res.ok) {
        const t = await res.text();
        this.log.warn(`SerpAPI HTTP ${res.status}: ${t.slice(0, 200)}`);
        return null;
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`SerpAPI fetch failed: ${msg}`);
      return null;
    }
  }

  /** Google Shopping — product cards with price, image, store link. */
  async googleShopping(query: string): Promise<SerpShoppingItem[]> {
    const q = query.slice(0, 400);
    const data = await this.fetchJson({
      engine: 'google_shopping',
      q,
      num: '12',
    });
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
    const data = await this.fetchJson({
      engine: 'amazon',
      k,
      amazon_domain: 'amazon.com',
    });
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
   * Google Maps — local results with coordinates when available.
   * When `location` is set, SerpAPI centers the map on that point (`ll`); without it,
   * queries like "near me" resolve to an arbitrary default region (often wrong).
   */
  async googleMaps(
    query: string,
    location?: { latitude: number; longitude: number },
  ): Promise<SerpLocalItem[]> {
    const q = query.slice(0, 400);
    const params: Record<string, string> = {
      engine: 'google_maps',
      q,
      type: 'search',
    };
    if (location) {
      const { latitude: lat, longitude: lng } = location;
      params.ll = `@${lat},${lng},14z`;
    }
    const data = await this.fetchJson(params);
    if (!data) return [];
    const raw = data.local_results;
    if (!Array.isArray(raw)) return [];
    const out: SerpLocalItem[] = [];
    for (const row of raw.slice(0, 12)) {
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
    const data = await this.fetchJson(params);
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
    const data = await this.fetchJson({
      engine: 'google',
      q,
      tbm: 'nws',
      tbs,
      num: '10',
    });
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
    const data = await this.fetchJson({
      engine: 'google_images',
      q,
      num: '20',
    });
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
    const data = await this.fetchJson(params);
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
    const data = await this.fetchJson({
      engine: 'google_finance',
      q,
    });
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
    const data = await this.fetchJson(params);
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
      this.log.warn(
        'google_flights: use query flight|DEP|ARR|YYYY-MM-DD (e.g. flight|AUS|SFO|2026-06-15)',
      );
      return null;
    }
    const params: Record<string, string> = {
      engine: 'google_flights',
      departure_id: parsed.departure_id,
      arrival_id: parsed.arrival_id,
      outbound_date: parsed.outbound_date,
      type: parsed.type,
      currency: 'USD',
    };
    const data = await this.fetchJson(params);
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
   * Google Hotels — query `hotel|city or name|check_in|check_out` (YYYY-MM-DD).
   */
  async googleHotels(query: string): Promise<Record<string, unknown> | null> {
    const parsed = parseHotelPipeQuery(query);
    if (!parsed) {
      this.log.warn(
        'google_hotels: use query hotel|Area or hotel name|check_in|check_out',
      );
      return null;
    }
    const data = await this.fetchJson({
      engine: 'google_hotels',
      q: parsed.q.slice(0, 400),
      check_in: parsed.check_in,
      check_out: parsed.check_out,
      gl: 'us',
    });
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
    const data = await this.fetchJson({ engine: 'google_forums', q });
    if (!data) return [];
    const raw = data.discussions_and_forums;
    if (!Array.isArray(raw)) return [];
    return this.mapSimpleRows(raw.slice(0, 12));
  }

  /** Faster image search (`engine=google_images_light`). */
  async googleImagesLight(query: string): Promise<SerpImageItem[]> {
    const q = query.slice(0, 400);
    const data = await this.fetchJson({
      engine: 'google_images_light',
      q,
      num: '20',
    });
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
      return null;
    }
    const data = await this.fetchJson({
      engine: 'google_maps_reviews',
      data_id: dataId,
    });
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
    const q = query.slice(0, 400);
    const params: Record<string, string> = {
      engine: 'google_local',
      q,
    };
    if (location) {
      params.ll = `@${location.latitude},${location.longitude},14z`;
    }
    const data = await this.fetchJson(params);
    if (!data) return [];
    const raw = data.local_results;
    if (!Array.isArray(raw)) return [];
    return this.mapLocalResultsRows(raw.slice(0, 12));
  }

  /** Google Local Services (`engine=google_local_services`). */
  async googleLocalServices(
    query: string,
    location?: { latitude: number; longitude: number },
  ): Promise<SerpSimpleRow[]> {
    const q = query.slice(0, 400);
    const params: Record<string, string> = {
      engine: 'google_local_services',
      q,
    };
    if (location) {
      params.ll = `@${location.latitude},${location.longitude},14z`;
    }
    const data = await this.fetchJson(params);
    if (!data) return [];
    const raw =
      data.local_services_results ?? data.local_results ?? data.local_place;
    if (!Array.isArray(raw)) return [];
    return this.mapSimpleRows(raw.slice(0, 12));
  }

  /** Travel Explore — inspiration / destinations (`engine=google_travel_explore`). */
  async googleTravelExplore(
    query: string,
  ): Promise<Record<string, unknown> | null> {
    const q = query.slice(0, 400);
    const data = await this.fetchJson({
      engine: 'google_travel_explore',
      q,
      gl: 'us',
    });
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
    const data = await this.fetchJson({
      engine: 'google_trends',
      q,
    });
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
      return null;
    }
    const data = await this.fetchJson({
      engine: 'google_immersive_product',
      page_token: token,
    });
    if (!data) return null;
    return { immersive_product: data.immersive_product ?? data };
  }

  /** Amazon PDP scrape (`engine=amazon_product`) — query raw ASIN or `asin|B0...`. */
  async amazonProduct(query: string): Promise<Record<string, unknown> | null> {
    const asin = parseAmazonAsinQuery(query);
    if (!asin) {
      this.log.warn('amazon_product: pass ASIN or asin|B0XXXXXXXX');
      return null;
    }
    const data = await this.fetchJson({
      engine: 'amazon_product',
      asin,
      amazon_domain: 'amazon.com',
    });
    if (!data) return null;
    return {
      product_results: data.product_results ?? data,
      search_parameters: data.search_parameters ?? null,
    };
  }

  /** Apple App Store search (`engine=apple_app_store`). */
  async appleAppStore(query: string): Promise<SerpSimpleRow[]> {
    const term = query.slice(0, 200);
    const data = await this.fetchJson({
      engine: 'apple_app_store',
      term,
      country: 'us',
    });
    if (!data) return [];
    const raw = data.organic_results;
    if (!Array.isArray(raw)) return [];
    return this.mapSimpleRows(raw.slice(0, 15));
  }

  /** Home Depot product search (`engine=home_depot`). */
  async homeDepot(query: string): Promise<SerpSimpleRow[]> {
    const q = query.slice(0, 400);
    const data = await this.fetchJson({
      engine: 'home_depot',
      q,
    });
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
    const data = await this.fetchJson({
      engine: 'facebook_profile',
      profile_id,
    });
    if (!data) return null;
    return { facebook_profile: data };
  }

  /** Google Scholar (`engine=google_scholar`) — academic papers. */
  async googleScholar(query: string): Promise<SerpSimpleRow[]> {
    const q = query.slice(0, 400);
    const data = await this.fetchJson({
      engine: 'google_scholar',
      q,
    });
    if (!data) return [];
    const raw = data.organic_results;
    if (!Array.isArray(raw)) return [];
    return this.mapSimpleRows(raw.slice(0, 12));
  }

  /** Dedicated Google News engine (`engine=google_news`). */
  async googleNewsEngine(query: string): Promise<SerpNewsItem[]> {
    const q = query.slice(0, 400);
    const data = await this.fetchJson({
      engine: 'google_news',
      q,
      gl: 'us',
      hl: 'en',
    });
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
