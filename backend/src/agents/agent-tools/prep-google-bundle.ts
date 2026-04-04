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
  | 'local'
  | 'local_services'
  | 'web'
  | 'news'
  | 'images'
  | 'images_light'
  | 'jobs'
  | 'finance'
  | 'events'
  | 'flights'
  | 'hotels'
  | 'forums'
  | 'maps_reviews'
  | 'travel_explore'
  | 'trends'
  | 'immersive_product'
  | 'amazon_product'
  | 'apple_app_store'
  | 'home_depot'
  | 'facebook_profile'
  | 'scholar';

function isResearchFamilyIntent(intent: PrepIntent): boolean {
  return (
    intent === 'RESEARCH' ||
    intent === 'COMPARISON' ||
    intent === 'DECISION' ||
    intent === 'EVENTS' ||
    intent === 'FLIGHTS' ||
    intent === 'BUSINESS' ||
    intent === 'TRENDS' ||
    intent === 'MARKET' ||
    intent === 'JOBS'
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
  const loc = d.mapsLocation ?? undefined;
  switch (vertical) {
    case 'shopping':
      return runShoppingBundle(d, q);
    case 'maps':
      return runMapsPlaceBundle(d, q);
    case 'local': {
      const [rows, tv] = await Promise.all([
        d.serp.googleLocal(q, loc),
        d.tavily.search(`${q} local business reviews`, 4, {
          searchDepth: 'basic',
        }),
      ]);
      return JSON.stringify(
        { google_local: rows, context_tavily: tv },
        null,
        2,
      );
    }
    case 'local_services': {
      const [rows, tv] = await Promise.all([
        d.serp.googleLocalServices(q, loc),
        d.tavily.search(`${q} local services hiring licensed`, 4, {
          searchDepth: 'basic',
        }),
      ]);
      return JSON.stringify(
        { google_local_services: rows, context_tavily: tv },
        null,
        2,
      );
    }
    case 'web':
      return runOrganicWebBundle(d, q, `${q} background facts sources`);
    case 'news': {
      const [news, tv] = await Promise.all([
        d.serp.googleNewsEngine(q),
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
    case 'images_light': {
      const [imgs, tv] = await Promise.all([
        d.serp.googleImagesLight(q),
        d.tavily.search(`${q} image context`, 3, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        { google_images_light: imgs, context_tavily: tv },
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
    case 'events': {
      const [events, tv] = await Promise.all([
        d.serp.googleEvents(q),
        d.tavily.search(`${q} events venue tips`, 4, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        { google_events: events, context_tavily: tv },
        null,
        2,
      );
    }
    case 'flights': {
      const [flights, tv] = await Promise.all([
        Promise.resolve(d.serp.googleFlights(q)),
        d.tavily.search(`${q} airport travel tips`, 4, {
          searchDepth: 'basic',
        }),
      ]);
      return JSON.stringify(
        {
          google_flights: flights,
          flights_query_hint: 'flight|DEP_IATA|ARR_IATA|YYYY-MM-DD',
          context_tavily: tv,
        },
        null,
        2,
      );
    }
    case 'hotels': {
      const [hotels, tv] = await Promise.all([
        Promise.resolve(d.serp.googleHotels(q)),
        d.tavily.search(`${q} hotel neighborhood tips`, 4, {
          searchDepth: 'basic',
        }),
      ]);
      return JSON.stringify(
        {
          google_hotels: hotels,
          hotels_query_hint: 'hotel|City or name|check_in|check_out',
          context_tavily: tv,
        },
        null,
        2,
      );
    }
    case 'forums': {
      const [rows, tv] = await Promise.all([
        d.serp.googleForums(q),
        d.tavily.search(`${q} discussion summary`, 4, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        { google_forums: rows, context_tavily: tv },
        null,
        2,
      );
    }
    case 'maps_reviews': {
      const [revs, tv] = await Promise.all([
        Promise.resolve(d.serp.googleMapsReviews(q)),
        d.tavily.search(`${q} place reputation`, 3, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        {
          google_maps_reviews: revs,
          maps_reviews_query_hint: 'reviews|DATA_ID',
          context_tavily: tv,
        },
        null,
        2,
      );
    }
    case 'travel_explore': {
      const [explore, tv] = await Promise.all([
        Promise.resolve(d.serp.googleTravelExplore(q)),
        d.tavily.search(`${q} travel ideas`, 5, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        { google_travel_explore: explore, context_tavily: tv },
        null,
        2,
      );
    }
    case 'trends': {
      const [trends, tv] = await Promise.all([
        Promise.resolve(d.serp.googleTrends(q)),
        d.tavily.search(`${q} trend context`, 4, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        { google_trends: trends, context_tavily: tv },
        null,
        2,
      );
    }
    case 'immersive_product': {
      const [imm, tv] = await Promise.all([
        Promise.resolve(d.serp.googleImmersiveProduct(q)),
        d.tavily.search(`${q} product review`, 3, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        {
          google_immersive_product: imm,
          immersive_hint: 'product|PAGE_TOKEN from google_shopping',
          context_tavily: tv,
        },
        null,
        2,
      );
    }
    case 'amazon_product': {
      const [amz, tv] = await Promise.all([
        Promise.resolve(d.serp.amazonProduct(q)),
        d.tavily.search(`${q} product review`, 3, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        {
          amazon_product: amz,
          amazon_product_hint: 'asin|B0XXXXXXXX or raw ASIN',
          context_tavily: tv,
        },
        null,
        2,
      );
    }
    case 'apple_app_store': {
      const [rows, tv] = await Promise.all([
        d.serp.appleAppStore(q),
        d.tavily.search(`${q} app review`, 3, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        { apple_app_store: rows, context_tavily: tv },
        null,
        2,
      );
    }
    case 'home_depot': {
      const [rows, tv] = await Promise.all([
        d.serp.homeDepot(q),
        d.tavily.search(`${q} DIY product compare`, 3, {
          searchDepth: 'basic',
        }),
      ]);
      return JSON.stringify({ home_depot: rows, context_tavily: tv }, null, 2);
    }
    case 'facebook_profile': {
      const [fb, tv] = await Promise.all([
        Promise.resolve(d.serp.facebookProfile(q)),
        d.tavily.search(`${q} public background`, 3, { searchDepth: 'basic' }),
      ]);
      return JSON.stringify(
        { facebook_profile: fb, context_tavily: tv },
        null,
        2,
      );
    }
    case 'scholar': {
      const [rows, tv] = await Promise.all([
        d.serp.googleScholar(q),
        d.tavily.search(`${q} paper summary context`, 4, {
          searchDepth: 'basic',
        }),
      ]);
      return JSON.stringify(
        { google_scholar: rows, context_tavily: tv },
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
      if (
        vertical === 'events' ||
        vertical === 'local' ||
        vertical === 'local_services' ||
        vertical === 'travel_explore' ||
        vertical === 'maps_reviews'
      ) {
        return runResearchVerticalBundle(d, q, vertical);
      }
      return runMapsPlaceBundle(d, q);
    case 'FIND_PERSON':
      return runOrganicWebBundle(d, q, `${q} background role professional`);
    case 'SCHEDULE_PREP':
      return runScheduleBundle(d, q);
    case 'LIFE_ADMIN':
      if (vertical === 'maps') {
        return runMapsPlaceBundle(d, q);
      }
      if (
        vertical === 'flights' ||
        vertical === 'hotels' ||
        vertical === 'travel_explore' ||
        vertical === 'events' ||
        vertical === 'local' ||
        vertical === 'local_services' ||
        vertical === 'finance' ||
        vertical === 'trends'
      ) {
        return runResearchVerticalBundle(d, q, vertical);
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
