import type {
  MessageLinkContentType,
  MessageLinkFetchStatus,
} from '@/database/schemas/index';

export type LinkPromptItem = {
  originalUrl: string;
  canonicalUrl: string | null;
  fetchStatus: MessageLinkFetchStatus;
  contentType: MessageLinkContentType | null;
  pageTitle: string | null;
  structuredSummary: string | null;
  extractedMetadata: Record<string, unknown> | null;
  /** Capped reader body for substantive memory — omit when fetch failed. */
  recallExcerpt: string | null;
};

function metaLine(meta: Record<string, unknown> | null): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  try {
    const s = JSON.stringify(meta);
    return s.length > 1200 ? `${s.slice(0, 1200)}…` : s;
  } catch {
    return '';
  }
}

/** Compact block for Pem agent / Ask — memorize, organize, recall; not open-ended research. */
export function buildLinkContextPromptSection(items: LinkPromptItem[]): string {
  if (!items.length) return '';

  const blocks = items.map((it, i) => {
    const parts = [
      `### Link ${i + 1}`,
      `- Original URL (as sent): ${it.originalUrl}`,
      it.canonicalUrl ? `- Canonical URL: ${it.canonicalUrl}` : null,
      `- Fetch status: ${it.fetchStatus}`,
      it.contentType ? `- Content type: ${it.contentType}` : null,
      it.pageTitle ? `- Page title: ${it.pageTitle}` : null,
      it.structuredSummary
        ? `- Summary: ${it.structuredSummary}`
        : '- Summary: (none)',
    ].filter(Boolean);

    const ml = metaLine(it.extractedMetadata);
    if (ml) parts.push(`- Extracted metadata (JSON): ${ml}`);

    const canUseBody =
      it.recallExcerpt &&
      (it.fetchStatus === 'success' || it.fetchStatus === 'cached');
    if (canUseBody) {
      parts.push(
        `- Preview text from page metadata (memory + light organization only — do NOT treat as a mandate for contract/ToS analysis, multi-source research, news fact-checking, or deep product investigation):\n"""${it.recallExcerpt}"""`,
      );
    }

    if (it.fetchStatus === 'unauthorized') {
      parts.push(
        '- Guidance: Explain honestly that the site blocked full content or requires login. Ask them to paste text or say what to save.',
      );
    }
    if (it.fetchStatus === 'timeout') {
      parts.push(
        '- Guidance: Say the fetch timed out; offer to retry or paste details.',
      );
    }
    if (it.fetchStatus === 'failed' || it.fetchStatus === 'malformed') {
      parts.push(
        '- Guidance: Say the link could not be read; ask for a different URL or pasted content.',
      );
    }

    return parts.join('\n');
  });

  return `## Links the user shared (Open Graph / title preview — Pem’s loop: remember · organize · recall)
Use title, summary, metadata, and preview text only to help them find this again later and to organize when intent is obvious (e.g. shopping list, job follow-up). Prefer a memory_write with recall-worthy substance when preview + summary give you enough — not a URL-only stub unless there is truly nothing to retain.

${blocks.join('\n\n')}`;
}
