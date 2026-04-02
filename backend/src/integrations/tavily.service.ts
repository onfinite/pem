import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
};

@Injectable()
export class TavilyService {
  private readonly log = new Logger(TavilyService.name);

  constructor(private readonly config: ConfigService) {}

  async search(query: string, maxResults = 5): Promise<TavilySearchResult[]> {
    const key = this.config.get<string>('tavily.apiKey');
    if (!key) {
      this.log.warn('TAVILY_API_KEY missing — returning empty search results');
      return [];
    }

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: false,
      }),
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
