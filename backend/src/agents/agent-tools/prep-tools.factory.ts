import { generateText, tool } from 'ai';
import type { LanguageModel, Tool } from 'ai';
import { z } from 'zod';

import type { TavilyService } from '../../integrations/tavily.service';
import type { ProfileService } from '../../profile/profile.service';
import type { PrepIntent } from '../intents/prep-intent';
import {
  intentAllowsFetch,
  intentAllowsSearch,
} from '../intents/prep-intent-routing';
import { buildPrepDraftToolPrompt } from '../prompts/prep-draft.tool.prompt';
import { stripHtml } from '../utils/strip-html';

/**
 * Tavily excludes for **SHOPPING** — prefer direct retailer product pages (PDPs), not maps,
 * local directories, or Google Shopping SERP (user wants buy links like retailer sites).
 */
const SHOPPING_SEARCH_EXCLUDE_DOMAINS: string[] = [
  'shopping.google.com',
  'maps.google.com',
  'yelp.com',
  'tripadvisor.com',
  'yellowpages.com',
  'mapquest.com',
  'foursquare.com',
  'nextdoor.com',
  'chamberofcommerce.com',
];

export type PrepToolsFactoryDeps = {
  tavily: TavilyService;
  profile: ProfileService;
  userId: string;
  prepId: string;
  dumpId: string;
  agentModel: LanguageModel;
  userPrompt: string;
  displayName: string | null;
  /** Routed intent — gates web search/fetch per `pem-intake-routing.mdc`. */
  intent: PrepIntent;
};

export function createPrepAgentTools(d: PrepToolsFactoryDeps) {
  const searchDescription =
    d.intent === 'SHOPPING'
      ? 'Search the web for **online retailer product pages** (Amazon, Target, Walmart, Best Buy, brand official store, etc.). Write queries that name the product and a retailer or "buy online" — avoid "near me", city-only, or store-locator intent. Results are biased away from maps and local listings.'
      : 'Search the public web via Tavily for current facts, policies, products, prices';

  const searchTool = tool({
    description: searchDescription,
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }: { query: string }) => {
      const trimmed = query.trim();
      if (d.intent === 'SHOPPING') {
        const q = (trimmed.length > 0 ? trimmed : 'product').slice(0, 350);
        const shoppingQuery =
          `${q} buy online retailer product page price`.slice(0, 400);
        const hits = await d.tavily.search(shoppingQuery, 10, {
          searchDepth: 'advanced',
          excludeDomains: SHOPPING_SEARCH_EXCLUDE_DOMAINS,
        });
        return JSON.stringify(hits, null, 2);
      }
      const hits = await d.tavily.search(trimmed, 6);
      return JSON.stringify(hits, null, 2);
    },
  });

  const fetchTool = tool({
    description:
      d.intent === 'SHOPPING'
        ? 'Fetch a **retailer product page URL** (PDP) — Amazon /dp/, Target /p/, Walmart /ip/, brand store product URL — to confirm price, title, and og:image. Do not use fetch() for maps, Yelp, or Google Shopping search results; open the real seller product page instead.'
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
      'Read active memory for a topic (snake_case key, e.g. budget, vehicle, city, family). Call early when the thought could involve stored preferences — before search/fetch — and whenever you need a detail that might exist under another key.',
    inputSchema: z.object({ key: z.string() }),
    execute: async ({ key }: { key: string }) => {
      const v = await d.profile.remember(d.userId, key);
      return v ?? '(not set)';
    },
  });

  const saveTool = tool({
    description:
      'Save a durable fact as natural language (not just a value). memory_key is short snake_case (e.g. vehicle, budget, allergies, work). note is one or two sentences. Call when the user states something lasting, when tools confirm specifics worth recalling, or when you correct outdated memory — Pem gets better for them every time you save. Replaces prior active memory for that key (history kept).',
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

  if (intentAllowsSearch(d.intent)) {
    tools.search = searchTool;
  }
  if (intentAllowsFetch(d.intent)) {
    tools.fetch = fetchTool;
  }

  return tools;
}
