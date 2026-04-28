import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LINK_JINA_FETCH_TIMEOUT_MS } from '@/chat/link-reading.constants';
import type { JinaSnapshotStored } from '@/chat/types/jina-snapshot-stored.types';
import { parseJinaReaderJsonBody } from '@/chat/utils/parse-jina-reader-json';
import { markdownFromJinaSnapshot } from '@/chat/utils/jina-snapshot-markdown';

export type JinaReaderResult = {
  /** Normalized snapshot (null when fetch failed / empty / parse error). */
  snapshot: JinaSnapshotStored | null;
  /** `data.content` — used for classifiers + markdown image extraction. */
  markdown: string;
  canonicalUrl: string | null;
  /** Prefer `data.title` from JSON when present. */
  titleFromApi: string | null;
  timedOut: boolean;
  httpStatus: number;
};

function buildJinaRequestUrl(targetHref: string): string {
  const u = new URL(targetHref);
  const port =
    u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : '';
  const path = `${u.protocol}//${u.hostname}${port}${u.pathname}${u.search}`;
  return `https://r.jina.ai/${path}`;
}

function readHeader(headers: Headers, names: string[]): string | null {
  for (const n of names) {
    const v = headers.get(n);
    if (v?.trim()) return v.trim();
  }
  return null;
}

@Injectable()
export class JinaReaderService {
  private readonly log = new Logger(JinaReaderService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchPage(targetHref: string): Promise<JinaReaderResult> {
    const apiKey = this.config.get<string>('jina.apiKey');
    if (!apiKey) {
      this.log.warn('JINA_API_KEY not set — link reading disabled');
      return {
        snapshot: null,
        markdown: '',
        canonicalUrl: null,
        titleFromApi: null,
        timedOut: false,
        httpStatus: 0,
      };
    }

    const reqUrl = buildJinaRequestUrl(targetHref);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LINK_JINA_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(reqUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'X-Robots-Txt': 'JinaReader',
        },
        signal: ac.signal,
      });

      const canonicalUrl =
        readHeader(res.headers, [
          'x-final-url',
          'x-request-url',
          'x-url',
          'jina-request-url',
        ]) ?? null;

      const text = await res.text();
      if (!res.ok) {
        this.log.warn(`Jina non-OK status=${res.status} messageIdHint=fetch`);
        return {
          snapshot: null,
          markdown: '',
          canonicalUrl,
          titleFromApi: null,
          timedOut: false,
          httpStatus: res.status,
        };
      }

      const parsed = parseJinaReaderJsonBody(text);
      if (!parsed) {
        this.log.warn('Jina JSON parse failed messageIdHint=fetch');
        return {
          snapshot: null,
          markdown: '',
          canonicalUrl,
          titleFromApi: null,
          timedOut: false,
          httpStatus: res.status,
        };
      }

      const md = markdownFromJinaSnapshot(parsed).trim();
      const titleRaw = parsed.data?.title?.trim();
      return {
        snapshot: parsed,
        markdown: md,
        canonicalUrl,
        titleFromApi: titleRaw ? titleRaw.slice(0, 500) : null,
        timedOut: false,
        httpStatus: res.status,
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      this.log.warn(
        `Jina fetch ${isAbort ? 'timeout' : 'error'} messageIdHint=fetch`,
      );
      return {
        snapshot: null,
        markdown: '',
        canonicalUrl: null,
        titleFromApi: null,
        timedOut: isAbort,
        httpStatus: 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
