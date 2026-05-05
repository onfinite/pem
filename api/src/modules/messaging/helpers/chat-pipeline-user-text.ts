import { USER_FACING_TRIAGE_MAX_CHARS } from '@/modules/chat/constants/chat.constants';
import type { MessageKind } from '@/database/schemas/messages.schema';

function cap(s: string): string {
  const t = s.trim();
  if (t.length <= USER_FACING_TRIAGE_MAX_CHARS) return t;
  return `${t.slice(0, USER_FACING_TRIAGE_MAX_CHARS)}…`;
}

/**
 * Text for triage + moderation: user caption / transcript only on photo turns,
 * so vision OCR and agent instructions do not skew routing or false-flag moderation.
 */
export function buildUserFacingTextForTriage(params: {
  kind: MessageKind;
  hasUserImages: boolean;
  /** User line after voice transcribe selection, before image vision injection. */
  fallbackFullText: string;
  caption: string;
  transcript: string;
}): string {
  if (
    params.kind === 'image' ||
    (params.kind === 'voice' && params.hasUserImages)
  ) {
    const joined = [params.caption, params.transcript]
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
    return cap(joined);
  }
  return cap(params.fallbackFullText);
}

/**
 * URL discovery for link fetch: caption + transcript on photo turns (not vision body).
 */
export function buildUrlSourceForLinkExtraction(params: {
  kind: MessageKind;
  hasUserImages: boolean;
  fallbackFullText: string;
  caption: string;
  transcript: string;
}): string {
  if (
    params.kind === 'image' ||
    (params.kind === 'voice' && params.hasUserImages)
  ) {
    return [params.caption, params.transcript]
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
  }
  return params.fallbackFullText.trim();
}
