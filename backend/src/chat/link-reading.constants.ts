/** Max URLs to resolve per user message (cost + latency guard). */
export const LINK_READ_MAX_URLS_PER_MESSAGE = 5;

/** Reuse Jina snapshot when last fetch is newer than this. */
export const LINK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Stored markdown cap (characters) — DB and classifier input. */
export const LINK_JINA_CONTENT_MAX_CHARS = 120_000;

/** Abort Jina HTTP request after this. */
export const LINK_JINA_FETCH_TIMEOUT_MS = 45_000;

/** Classifier input cap (characters of markdown). */
export const LINK_CLASSIFIER_MARKDOWN_MAX_CHARS = 24_000;
