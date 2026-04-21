/**
 * Shared patterns for URL detection (keep in sync with extract + url-only).
 * Allow parens/quotes common in tracking URLs; stop at whitespace or obvious HTML.
 */
export const LINK_HTTPS_URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

export const LINK_BARE_URL_REGEX =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+(?:\/[^\s<>"{}|\\^`[\]()]*[^\s<>"{}|\\^`[\]().,;:])?/gi;
