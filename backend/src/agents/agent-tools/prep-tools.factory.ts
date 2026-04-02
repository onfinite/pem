import { generateText, tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import type { TavilyService } from '../../integrations/tavily.service';
import type { ProfileService } from '../../profile/profile.service';
import { stripHtml } from '../utils/strip-html';

export type PrepToolsFactoryDeps = {
  tavily: TavilyService;
  profile: ProfileService;
  userId: string;
  prepId: string;
  dumpId: string;
  agentModel: LanguageModel;
  userPrompt: string;
  displayName: string | null;
};

export function createPrepAgentTools(d: PrepToolsFactoryDeps) {
  const searchTool = tool({
    description:
      'Search the public web via Tavily for current facts, policies, products, prices',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }: { query: string }) => {
      const hits = await d.tavily.search(query, 6);
      return JSON.stringify(hits, null, 2);
    },
  });

  const fetchTool = tool({
    description:
      'Fetch a public product or article URL and return readable text (and use the same page to infer og:image / main image URL for product cards)',
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
      'Read active memory for a topic (snake_case key, e.g. car, vehicle, location). Call before search when we might already know.',
    inputSchema: z.object({ key: z.string() }),
    execute: async ({ key }: { key: string }) => {
      const v = await d.profile.remember(d.userId, key);
      return v ?? '(not set)';
    },
  });

  const saveTool = tool({
    description:
      'Save a durable fact as natural language (not just a value). memory_key is short snake_case (e.g. vehicle, budget). note is one or two sentences. Call when the user states something lasting or when tools confirm it. Replaces prior active memory for that key (history kept).',
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
      const who =
        d.displayName ??
        '(name not on file — use a neutral greeting and no fake name)';
      const out = await generateText({
        model: d.agentModel,
        prompt: `Write a message the USER will paste and send as themselves.

The user's display name for greetings and sign-offs: ${who}
Use memory and profile from the prep context for specifics. Do not invent a name if none is given.

Goal: ${goal}
Tone: ${tone}

Context:
${d.userPrompt}`,
      });
      return JSON.stringify({
        body: out.text,
        subject: null as string | null,
        tone,
      });
    },
  });

  return {
    search: searchTool,
    fetch: fetchTool,
    remember: rememberTool,
    save: saveTool,
    draft: draftTool,
  };
}
