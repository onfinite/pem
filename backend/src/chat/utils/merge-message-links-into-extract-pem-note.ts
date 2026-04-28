import type { ExtractAction } from '@/agents/pem-agent.schemas';
import type { MessageLinkRow } from '@/database/schemas/index';

export function displayUrlsFromMessageLinkRows(
  rows: MessageLinkRow[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const u = (r.canonicalUrl?.trim() || r.originalUrl.trim()).trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function urlAlreadyReferenced(url: string, haystack: string): boolean {
  const h = haystack.toLowerCase();
  const u = url.toLowerCase();
  if (h.includes(u)) return true;
  try {
    const { hostname, pathname, search } = new URL(url);
    const core = `${hostname.toLowerCase()}${pathname.toLowerCase()}${search.toLowerCase()}`;
    return h.includes(core);
  } catch {
    return false;
  }
}

/** Appends `Link: …` lines for URLs not already present in task text / note / fragment. */
export function mergeMessageLinksIntoExtractPemNote(
  item: ExtractAction,
  urls: string[],
): ExtractAction {
  if (!urls.length) return item;
  const haystack = [item.text, item.pem_note, item.original_text]
    .filter(Boolean)
    .join('\n');
  const missing = urls.filter((u) => !urlAlreadyReferenced(u, haystack));
  if (!missing.length) return item;
  const block = missing.map((u) => `Link: ${u}`).join('\n');
  const prev = item.pem_note?.trim();
  const pem_note = prev ? `${prev}\n\n${block}` : block;
  return { ...item, pem_note };
}
