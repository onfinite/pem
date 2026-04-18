export type TextOrUrlSegment =
  | { type: "text"; value: string }
  | { type: "url"; display: string; href: string };

/**
 * Splits a string into text and http(s) URL segments. Trailing punctuation
 * is kept on `display` but stripped from `href` for opening (e.g. "…see https://x.com)."
 */
export function splitTextWithUrls(input: string): TextOrUrlSegment[] {
  if (!input) {
    return [];
  }
  const re = /https?:\/\/[^\s<>'"[\]()]+/gi;
  const matches = [...input.matchAll(re)];
  if (matches.length === 0) {
    return [{ type: "text", value: input }];
  }

  const out: TextOrUrlSegment[] = [];
  let last = 0;
  for (const m of matches) {
    const start = m.index ?? 0;
    const display = m[0];
    if (start > last) {
      out.push({ type: "text", value: input.slice(last, start) });
    }
    const href = display.replace(/[),.;:!?\]]+$/g, "");
    out.push({ type: "url", display, href });
    last = start + display.length;
  }
  if (last < input.length) {
    out.push({ type: "text", value: input.slice(last) });
  }
  return out;
}
