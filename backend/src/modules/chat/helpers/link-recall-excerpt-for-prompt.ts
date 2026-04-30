import { LINK_PROMPT_BODY_MAX_CHARS } from '@/modules/chat/constants/link-reading.constants';

/**
 * Text passed to Pem / Ask for link substance — OG title + description only (no full page body).
 */
export function linkRecallExcerptForPrompt(params: {
  pageTitle: string | null;
  structuredSummary: string | null;
}): string | null {
  const t = params.pageTitle?.trim() ?? '';
  const s = params.structuredSummary?.trim() ?? '';
  const out = [t, s].filter(Boolean).join('\n\n').trim();
  if (!out) return null;
  if (out.length <= LINK_PROMPT_BODY_MAX_CHARS) return out;
  return `${out.slice(0, LINK_PROMPT_BODY_MAX_CHARS)}\n\n…`;
}
