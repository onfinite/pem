import { Injectable, Logger } from '@nestjs/common';

import { isBlockedSsrFHost } from '@/core/utils/ssrf-guard-for-http-url';
import {
  OG_HTML_FETCH_MAX_BYTES,
  OG_HTML_FETCH_TIMEOUT_MS,
} from '@/modules/media/links/constants/og-html-fetch.constants';
import {
  extractOgMetaFromHtml,
  looksLikeLoginWallHtml,
} from '@/modules/media/links/helpers/reader-og-html.helpers';
import type { OgHtmlReaderResult } from '@/modules/media/links/types/og-html-reader.types';
import { logWithContext } from '@/core/utils/format-log-context';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (compatible; PemLinkPreview/1.0; +https://heypem.com)',
  Accept: 'text/html,application/xhtml+xml',
};

/** SSRF-guarded HTML fetch + Open Graph parse for chat link previews. */
@Injectable()
export class OgHtmlReaderService {
  private readonly log = new Logger(OgHtmlReaderService.name);

  async fetchOgMeta(normalizedUrl: string): Promise<OgHtmlReaderResult> {
    let host = '';
    try {
      host = new URL(normalizedUrl).hostname;
    } catch {
      return { kind: 'http_error', httpStatus: 0 };
    }
    if (isBlockedSsrFHost(host)) {
      return { kind: 'blocked' };
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), OG_HTML_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(normalizedUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: FETCH_HEADERS,
        signal: ac.signal,
      });

      if (!res.ok) {
        return { kind: 'http_error', httpStatus: res.status };
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) {
        return { kind: 'empty_response' };
      }

      const max = Math.min(buf.byteLength, OG_HTML_FETCH_MAX_BYTES);
      const html = new TextDecoder('utf-8', { fatal: false }).decode(
        buf.slice(0, max),
      );

      const finalUrl = res.url || normalizedUrl;
      const meta = extractOgMetaFromHtml(html, finalUrl);
      const suspectedLoginWall = looksLikeLoginWallHtml(html);

      return {
        kind: 'ok',
        finalUrl,
        title: meta.title,
        description: meta.description,
        imageUrl: meta.imageUrl,
        httpStatus: res.status,
        htmlLength: html.length,
        suspectedLoginWall,
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      this.log.warn(
        logWithContext(`OG fetch ${isAbort ? 'timeout' : 'error'}`, {
          scope: 'og_html_reader',
          host,
          timedOut: isAbort,
        }),
      );
      return isAbort
        ? { kind: 'timeout' }
        : { kind: 'http_error', httpStatus: 0 };
    } finally {
      clearTimeout(timer);
    }
  }
}
