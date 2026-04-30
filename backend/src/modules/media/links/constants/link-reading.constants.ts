/** Max URLs to resolve per user message (cost + latency guard). */
export const LINK_READ_MAX_URLS_PER_MESSAGE = 5;

/** Reuse prior link row when last fetch is newer than this (per-user cache key). */
export const LINK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Max characters of OG-derived preview text injected into Pem / Ask link context. */
export const LINK_PROMPT_BODY_MAX_CHARS = 8000;
