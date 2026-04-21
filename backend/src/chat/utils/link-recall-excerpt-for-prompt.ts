import { LINK_PROMPT_BODY_MAX_CHARS } from '../link-reading.constants';
import { markdownFromJinaSnapshot } from './jina-snapshot-markdown';
import { parseStoredJinaSnapshot } from './parse-stored-jina-snapshot';

/**
 * Capped page body for the Pem / Ask link prompt — enough substance for memory_write
 * notes and recall, without turning the run into open-ended “research this page.”
 */
export function linkRecallExcerptForPrompt(
  jinaSnapshot: unknown,
): string | null {
  const snap = parseStoredJinaSnapshot(jinaSnapshot);
  const md = markdownFromJinaSnapshot(snap).trim();
  if (!md) return null;
  if (md.length <= LINK_PROMPT_BODY_MAX_CHARS) return md;
  return `${md.slice(0, LINK_PROMPT_BODY_MAX_CHARS)}\n\n…`;
}
