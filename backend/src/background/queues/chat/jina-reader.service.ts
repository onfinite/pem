import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LINK_JINA_FETCH_TIMEOUT_MS } from '../../../chat/link-reading.constants';

export type JinaReaderResult = {
  markdown: string;
  canonicalUrl: string | null;
  titleFromLine: string | null;
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

/** First markdown H1 or Title: line as weak title hint. */
function titleFromMarkdown(md: string): string | null {
  const lines = md.split('\n').slice(0, 40);
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('# ')) return t.slice(2).trim().slice(0, 500) || null;
    if (/^title\s*:/i.test(t)) {
      return (
        t
          .replace(/^title\s*:/i, '')
          .trim()
          .slice(0, 500) || null
      );
    }
  }
  return null;
}

@Injectable()
export class JinaReaderService {
  private readonly log = new Logger(JinaReaderService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchMarkdown(targetHref: string): Promise<JinaReaderResult> {
    const apiKey = this.config.get<string>('jina.apiKey');
    if (!apiKey) {
      this.log.warn('JINA_API_KEY not set — link reading disabled');
      return {
        markdown: '',
        canonicalUrl: null,
        titleFromLine: null,
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
          Accept: 'text/markdown',
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
      const markdown = res.ok ? text : '';
      if (!res.ok) {
        this.log.warn(`Jina non-OK status=${res.status} messageIdHint=fetch`);
      }

      const md = markdown.trim();
      return {
        markdown: md,
        canonicalUrl,
        titleFromLine: md ? titleFromMarkdown(md) : null,
        timedOut: false,
        httpStatus: res.status,
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      this.log.warn(
        `Jina fetch ${isAbort ? 'timeout' : 'error'} messageIdHint=fetch`,
      );
      return {
        markdown: '',
        canonicalUrl: null,
        titleFromLine: null,
        timedOut: isAbort,
        httpStatus: 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
