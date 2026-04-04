import type { SerpApiService } from '../../integrations/serpapi.service';
import type { TavilyService } from '../../integrations/tavily.service';
import type { PrepIntent } from '../intents/prep-intent';
import { SHOPPING_SEARCH_EXCLUDE_DOMAINS } from './shopping-search.constants';

export type GoogleBundleDeps = {
  intent: PrepIntent;
  serp: SerpApiService;
  tavily: TavilyService;
  /** SerpAPI `ll` for `google_maps` — device location from client hint (not persisted). */
  mapsLocation?: { latitude: number; longitude: number } | null;
};

/** Pass to `google()` — picks SerpAPI engine + Tavily pairing. */
export type GoogleVertical =
  | 'shopping'
  | 'maps'
  | 'web'
  | 'news'
  | 'images'
  | 'jobs'
  | 'finance';

function isResearchFamilyIntent(intent: PrepIntent): boolean {
  return (
    intent === 'RESEARCH' || intent === 'COMPARISON' || intent === 'DECISION'
  );
}

async function runShoppingBundle(
  d: GoogleBundleDeps,
  q: string,
): Promise<string> {
  const [shopping, amazon, buyingContext] = await Promise.all([
    d.serp.googleShopping(q),
    d.serp.amazonSearch(q),
    d.tavily.search(`${q} expert review buying guide`, 5, {
      searchDepth: 'advanced',
      excludeDomains: SHOPPING_SEARCH_EXCLUDE_DOMAINS,
    }),
  ]);
  return JSON.stringify(
    {
      google_shopping: shopping,
      amazon_search: amazon,
      buying_guide_tavily: buyingContext,
    },
    null,
    2,
  );
}

async function runMapsPlaceBundle(
  d: GoogleBundleDeps,
  q: string,
): Promise<string> {
  const loc = d.mapsLocation ?? undefined;
  const tavilyQuery =
    loc !== undefined
      ? `${q} reviews what to know (${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)})`
      : `${q} reviews what to know`;
  const [maps, extra] = await Promise.all([
    d.serp.googleMaps(q, loc),
    d.tavily.search(tavilyQuery, 4, {
      searchDepth: 'basic',
    }),
  ]);
  return JSON.stringify({ google_maps: maps, context_tavily: extra }, null, 2);
}

async function runOrganicWebBundle(
  d: GoogleBundleDeps,
  q: string,
  tavilyHint: string,
): Promise<string> {
  const [organic, tv] = await Promise.all([
    d.serp.googleOrganic(q),
    d.tavily.search(tavilyHint, 6, { searchDepth: 'advanced' }),
  ]);
  return JSON.stringify(
    { google_organic: organic, synthesis_tavily: tv },
    null,
    2,
  );
}

async function runScheduleBundle(
  d: GoogleBundleDeps,
  q: string,
): Promise<string> {
  const [organic, background] = await Promise.all([
    d.serp.googleOrganic(`${q} news`, { pastMonth: true }),
    d.tavily.search(`${q} company overview background`, 6, {
      searchDepth: 'advanced',
    }),
  ]);
  return JSON.stringify(
    { google_organic: organic, synthesis_tavily: background },
    null,
    2,
  );
}

async function runLifeAdminWebBundle(
  d: GoogleBundleDeps,
  q: string,
): Promise<string> {
  const [organic, tv] = await Promise.all([
    d.serp.googleOrganic(q),
    d.tavily.search(q, 8, { searchDepth: 'advanced' }),
  ]);
  return JSON.stringify(
    { google_organic: organic, context_tavily: tv },
    null,
    2,
  );
}

async function runResearchVerticalBundle(
  d: GoogleBundleDeps,
  q: string,
  vertical: GoogleVertical,
): Promise<string> {
  switch (vertical) {
    case 'shopping':
      return runShoppingBundle(d, q);
    case 'maps':
      return runMapsPlaceBundle(d, q);
    case 'web':
      return runOrganicWebBundle(d, q, `${q} background facts sources`);
    case 'news': {
      const [news, tv] = await Promise.all([
        d.serp.googleNews(q, { period: 'w' }),
        d.tavily.search(q, 4, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify({ google_news: news, context_tavily: tv }, null, 2);
    }
    case 'images': {
      const [imgs, tv] = await Promise.all([
        d.serp.googleImages(q),
        d.tavily.search(`${q} context`, 3, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        { google_images: imgs, context_tavily: tv },
        null,
        2,
      );
    }
    case 'jobs': {
      const [jobs, tv] = await Promise.all([
        d.serp.googleJobs(q),
        d.tavily.search(`${q} hiring company role`, 4, {
          searchDepth: 'basic',
        }),
      ]);
      return JSON.stringify({ google_jobs: jobs, context_tavily: tv }, null, 2);
    }
    case 'finance': {
      const [fin, tv] = await Promise.all([
        d.serp.googleFinance(q),
        d.tavily.search(`${q} market news`, 3, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        { google_finance: fin, context_tavily: tv },
        null,
        2,
      );
    }
    default:
      return JSON.stringify({
        error: `google() unknown vertical: ${vertical as string}`,
      });
  }
}

/**
 * Intent-aware SerpAPI + Tavily bundle (parallel where independent).
 * See `pem-search-provider-routing.mdc`.
 */
export async function executeGoogleBundle(
  d: GoogleBundleDeps,
  query: string,
  vertical: GoogleVertical,
): Promise<string> {
  const q = query.trim().slice(0, 400);
  if (!q) {
    return JSON.stringify({ error: 'Empty query' });
  }

  if (!d.serp.hasKey()) {
    const hits = await d.tavily.search(q, 8, { searchDepth: 'advanced' });
    return JSON.stringify(
      {
        warning:
          'SerpAPI not configured — using Tavily only. Set SERP_API_KEY for structured Serp engines.',
        tavily_fallback: hits,
      },
      null,
      2,
    );
  }

  if (d.intent === 'SHOPPING') {
    return runShoppingBundle(d, q);
  }

  if (isResearchFamilyIntent(d.intent)) {
    return runResearchVerticalBundle(d, q, vertical);
  }

  switch (d.intent) {
    case 'FIND_PLACE':
      return runMapsPlaceBundle(d, q);
    case 'FIND_PERSON':
      return runOrganicWebBundle(d, q, `${q} background role professional`);
    case 'SCHEDULE_PREP':
      return runScheduleBundle(d, q);
    case 'LIFE_ADMIN':
      if (vertical === 'maps') {
        return runMapsPlaceBundle(d, q);
      }
      return runLifeAdminWebBundle(d, q);
    default:
      return JSON.stringify(
        {
          error: `google() is not wired for intent ${d.intent}`,
        },
        null,
        2,
      );
  }
}
