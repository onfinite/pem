import type {
  MessageLinkContentType,
  MessageLinkFetchStatus,
} from '../../../database/schemas';

export type LinkPromptItem = {
  originalUrl: string;
  canonicalUrl: string | null;
  fetchStatus: MessageLinkFetchStatus;
  contentType: MessageLinkContentType | null;
  pageTitle: string | null;
  structuredSummary: string | null;
  extractedMetadata: Record<string, unknown> | null;
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

/** Compact block for Pem agent / Ask prompts — not full Jina markdown. */
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

    if (it.fetchStatus === 'unauthorized') {
      parts.push(
        '- Guidance: Explain honestly that the site blocked full content or requires login. Ask the user to paste text or say what to save.',
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

  return `## Links the user shared (fetched for you — use summary + metadata; do not invent facts not supported here)
When replying: confirm what you saved or understood, how they can recall it later (e.g. ask you about this link), and for products ask what they want unless intent is obvious. For social/login blocks, be specific about the limitation.

${blocks.join('\n\n')}`;
}
