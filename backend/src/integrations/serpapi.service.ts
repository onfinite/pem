import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { sortShoppingByPreferredRetailers } from './serp-shopping-prefer-retailers';

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
  placeUrl: string;
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
      const thumbRaw = typeof r.thumbnail === 'string' ? r.thumbnail : '';
      /** SerpAPI-hosted proxy — loads more reliably in mobile apps than raw Google CDN thumbs. */
      const serpapiThumb =
        typeof r.serpapi_thumbnail === 'string' ? r.serpapi_thumbnail : '';
      const thumbnail = serpapiThumb.trim() || thumbRaw.trim();
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
      const thumbnail = typeof r.thumbnail === 'string' ? r.thumbnail : '';
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
      const thumbRaw = typeof r.thumbnail === 'string' ? r.thumbnail : '';
      const serpapiThumb =
        typeof r.serpapi_thumbnail === 'string' ? r.serpapi_thumbnail : '';
      const thumbnail = serpapiThumb.trim() || thumbRaw.trim();
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
      const thumbRaw = typeof r.thumbnail === 'string' ? r.thumbnail : '';
      const serpapiThumb =
        typeof r.serpapi_thumbnail === 'string' ? r.serpapi_thumbnail : '';
      const thumbnail = serpapiThumb.trim() || thumbRaw.trim();
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
      const thumbRaw = typeof r.thumbnail === 'string' ? r.thumbnail : '';
      const serpapiThumb =
        typeof r.serpapi_thumbnail === 'string' ? r.serpapi_thumbnail : '';
      const thumbnail = serpapiThumb.trim() || thumbRaw.trim();
      const origImg = r.original_image as { link?: string } | undefined;
      const original =
        typeof r.original === 'string'
          ? r.original
          : typeof origImg?.link === 'string'
            ? origImg.link
            : thumbnail;
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
}
