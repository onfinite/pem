/** Aligned with backend `LINK_HTTPS_URL_REGEX` — long product URLs must match fully. */
const HTTP_URL = /https?:\/\/[^\s<>"']+/gi;

export function extractHttpUrlsFromUserText(text: string): string[] {
  const found = text.match(HTTP_URL);
  if (!found?.length) return [];
  return [...new Set(found)];
}
