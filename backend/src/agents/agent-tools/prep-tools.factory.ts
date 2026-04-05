import { generateText, tool } from 'ai';
import type { LanguageModel, Tool } from 'ai';
import { z } from 'zod';

import type { SerpApiService } from '../../integrations/serpapi.service';
import type { TavilyService } from '../../integrations/tavily.service';
import type { ProfileService } from '../../profile/profile.service';
import type { PrepIntent } from '../intents/prep-intent';
import {
  intentAllowsFetch,
  intentAllowsGoogleSerp,
  intentAllowsSearch,
} from '../intents/prep-intent-routing';
import { buildPrepDraftToolPrompt } from '../prompts/prep-draft.tool.prompt';
import { stripHtml } from '../utils/strip-html';

import { executeGoogleBundle, type GoogleVertical } from './prep-google-bundle';
import { SHOPPING_SEARCH_EXCLUDE_DOMAINS } from './shopping-search.constants';

export type PrepToolsFactoryDeps = {
  tavily: TavilyService;
  serp: SerpApiService;
  profile: ProfileService;
  userId: string;
  prepId: string;
  dumpId: string;
  agentModel: LanguageModel;
  userPrompt: string;
  displayName: string | null;
  /** Routed intent — gates web search/fetch per `pem-intake-routing.mdc`. */
  intent: PrepIntent;
  /** When set, `google()` maps + bundled Tavily use this point (from client hint). */
  mapsLocation?: { latitude: number; longitude: number } | null;
};

export function createPrepAgentTools(d: PrepToolsFactoryDeps) {
  const searchDescription =
    d.intent === 'SHOPPING'
      ? 'Supplemental **Tavily** web search only — expert reviews, comparisons, buying nuance **after** google(shopping). Not for raw product listings (use google() first).'
      : 'Search the public web via Tavily for facts, policies, articles, and synthesis-friendly excerpts.';

  const searchTool = tool({
    description: searchDescription,
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }: { query: string }) => {
      const trimmed = query.trim();
      if (d.intent === 'SHOPPING') {
        const q = (trimmed.length > 0 ? trimmed : 'product').slice(0, 400);
        const hits = await d.tavily.search(`${q} review expert opinion`, 8, {
          searchDepth: 'advanced',
          excludeDomains: SHOPPING_SEARCH_EXCLUDE_DOMAINS,
        });
        return JSON.stringify(hits, null, 2);
      }
      const hits = await d.tavily.search(trimmed, 6);
      return JSON.stringify(hits, null, 2);
    },
  });

  const googleVerticals = [
    'shopping',
    'local',
    'local_services',
    'web',
    'news',
    'images',
    'images_light',
    'jobs',
    'finance',
    'events',
    'flights',
    'hotels',
    'forums',
    'maps_reviews',
    'travel_explore',
    'trends',
    'immersive_product',
    'amazon_product',
    'apple_app_store',
    'home_depot',
    'facebook_profile',
    'scholar',
  ] as const satisfies readonly GoogleVertical[];

  const googleTool = tool({
    description:
      '**SerpAPI + Tavily bundle** — structured Google/third-party data plus context. Call **before** search() when you need real SERP rows. **vertical**: `shopping` (Google Shopping + Amazon + buying guide — **retail products**, not local SMB hiring), `local` (Google Local — businesses, services, places; JSON rows may include **phone**, **website**, **mapsUrl**), `local_services` (same Maps-backed local pack as `local` in Pem — free-text queries; rows may include **phone** / **website**), `web` (organic), `news` (google_news engine), `images` / `images_light` (fast images), `jobs`, `finance`, `events` (concerts/festivals), `flights` (query **flight|DEP|ARR|YYYY-MM-DD**), `hotels` (**hotel|City|check_in|check_out**), `forums` (discussions), `maps_reviews` (**reviews|DATA_ID**), `travel_explore`, `trends`, `immersive_product` (**product|PAGE_TOKEN** from shopping), `amazon_product` (ASIN or **asin|B0…**), `apple_app_store`, `home_depot`, `facebook_profile` (public id), `scholar` (papers). SHOPPING always shopping bundle; FIND_PLACE defaults to local; LIFE_ADMIN may use travel/finance/trends; RESEARCH/COMPARISON/DECISION can use any vertical. **If the JSON includes `serp_error` or `serp_retry_hint`,** read them, fix the query (dates, pipe format, DATA_ID, etc.), and **call google() again** — do not ignore engine errors.',
    inputSchema: z.object({
      query: z.string(),
      vertical: z.enum(googleVerticals),
    }),
    execute: async ({
      query,
      vertical,
    }: {
      query: string;
      vertical: GoogleVertical;
    }) => {
      return executeGoogleBundle(
        {
          intent: d.intent,
          serp: d.serp,
          tavily: d.tavily,
          mapsLocation: d.mapsLocation ?? null,
        },
        query,
        vertical,
      );
    },
  });

  const fetchTool = tool({
    description:
      d.intent === 'SHOPPING'
        ? 'Fetch a **retailer product page URL** (PDP) — Amazon /dp/, Target /p/, Walmart /ip/, brand store product URL — to confirm price, title, and og:image. Do not use fetch() for blog-only pages; open the real seller product page instead.'
        : 'Fetch a public product or article URL and return readable text (and use the same page to infer og:image / main image URL for product cards)',
    inputSchema: z.object({ url: z.string().url() }),
    execute: async ({ url }: { url: string }) => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'PemBot/1.0' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        return `HTTP ${res.status}`;
      }
      const html = await res.text();
      const og = html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      );
      const img = og?.[1]?.trim();
      const text = stripHtml(html);
      return img ? `IMAGE_URL: ${img}\n\n${text}` : text;
    },
  });

  const rememberTool = tool({
    description:
      'Read active memory for a topic (snake_case key, e.g. budget, vehicle, city, family). Call early when this thought or the full dump transcript could involve stored preferences — before search/fetch — and whenever you need a detail that might exist under another key.',
    inputSchema: z.object({ key: z.string() }),
    execute: async ({ key }: { key: string }) => {
      const v = await d.profile.remember(d.userId, key);
      return v ?? '(not set)';
    },
  });

  const saveTool = tool({
    description:
      'Save a durable, reusable fact as natural language (skip one-off logistics). memory_key is short snake_case (e.g. vehicle, budget, allergies, work). note is one or two sentences. Call when the user (in the thought or elsewhere in the dump transcript) states something worth recalling later, when tools confirm specifics worth keeping, or when you correct outdated memory. Replaces prior active memory for that key (history kept).',
    inputSchema: z.object({
      memory_key: z.string(),
      note: z.string(),
    }),
    execute: async ({
      memory_key,
      note,
    }: {
      memory_key: string;
      note: string;
    }) => {
      await d.profile.saveFromAgent(
        d.userId,
        memory_key,
        note,
        d.prepId,
        d.dumpId,
      );
      return 'saved';
    },
  });

  const draftTool = tool({
    description:
      'Generate a paste-ready email or message body (goal + tone). Use when the user needs to send something.',
    inputSchema: z.object({
      goal: z.string(),
      tone: z.string(),
    }),
    execute: async ({ goal, tone }: { goal: string; tone: string }) => {
      const out = await generateText({
        model: d.agentModel,
        prompt: buildPrepDraftToolPrompt({
          displayName: d.displayName,
          goal,
          tone,
          userPrompt: d.userPrompt,
        }),
      });
      return JSON.stringify({
        body: out.text,
        subject: null as string | null,
        tone,
      });
    },
  });

  const tools: Record<string, Tool> = {
    remember: rememberTool,
    save: saveTool,
    draft: draftTool,
  };

  if (intentAllowsGoogleSerp(d.intent)) {
    tools.google = googleTool;
  }
  if (intentAllowsSearch(d.intent)) {
    tools.search = searchTool;
  }
  if (intentAllowsFetch(d.intent)) {
    tools.fetch = fetchTool;
  }

  return tools;
}
