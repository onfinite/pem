import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
};

/** Optional Tavily `/search` tuning — see https://docs.tavily.com/documentation/api-reference/endpoint/search */
export type TavilySearchOptions = {
  /** Default `basic`. `advanced` uses 2 API credits per call, higher precision. */
  searchDepth?: 'basic' | 'advanced' | 'fast' | 'ultra-fast';
  /** Prefer results from these domains only (max 300). */
  includeDomains?: string[];
  /** Drop these domains (max 150) — e.g. maps / local listings for product search. */
  excludeDomains?: string[];
};

@Injectable()
export class TavilyService {
  private readonly log = new Logger(TavilyService.name);

  constructor(private readonly config: ConfigService) {}

  async search(
    query: string,
    maxResults = 5,
    options?: TavilySearchOptions,
  ): Promise<TavilySearchResult[]> {
    const key = this.config.get<string>('tavily.apiKey');
    if (!key) {
      this.log.warn('TAVILY_API_KEY missing — returning empty search results');
      return [];
    }

    const searchDepth = options?.searchDepth ?? 'basic';
    const payload: Record<string, unknown> = {
      api_key: key,
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: false,
    };
    if (options?.includeDomains?.length) {
      payload.include_domains = options.includeDomains;
    }
    if (options?.excludeDomains?.length) {
      payload.exclude_domains = options.excludeDomains;
    }

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      this.log.warn(`Tavily HTTP ${res.status}: ${text.slice(0, 200)}`);
      return [];
    }

    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    const results = data.results ?? [];
    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      content: r.content ?? '',
    }));
  }
}
