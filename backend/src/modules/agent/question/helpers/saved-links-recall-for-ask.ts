import { and, desc, eq, ilike, or } from 'drizzle-orm';

import type { DrizzleDb } from '@/database/database.module';
import { messageLinksTable } from '@/database/schemas/index';
import { formatChatRecallStamp } from '@/modules/agent/helpers/format-chat-recall-stamp';

const STOP = new Set([
  'what',
  'when',
  'where',
  'which',
  'your',
  'that',
  'this',
  'with',
  'from',
  'have',
  'does',
  'did',
  'link',
  'links',
  'article',
  'articles',
  'recipe',
  'recipes',
  'saved',
  'save',
  'find',
  'tell',
  'about',
  'remember',
  'recall',
]);

export function wantsSavedLinksRecall(question: string): boolean {
  const t = question.toLowerCase().trim();
  if (t.length < 6) return false;
  const hints = [
    /links?\s+(i|we)\s+saved/,
    /saved\s+links?/,
    /that\s+link\s+i\s+sent/,
    /the\s+link\s+i\s+(sent|shared|saved)/,
    /find\s+(that|the)\s+(link|article|url)/,
    /what\s+was\s+that\s+(link|article)/,
    /url(s)?\s+from\s+chat/,
    /articles?\s+i\s+(saved|sent)/,
    /recipes?\s+i\s+(saved|sent)/,
    /what\s+was\s+that\s+(recipe|article)/,
    /do\s+you\s+remember.*\b(link|url|article)\b/,
    /\brecall\b.*\b(link|url|article)\b/,
    /\b(can\s+u|can\s+you)\s+recall\b/,
    /\b(remind|remember)\s+me\b.*\b(link|url|article)\b/,
  ];
  return hints.some((re) => re.test(t));
}

function searchPatternFromQuestion(question: string): string | null {
  const quoted = /"([^"]{2,120})"/.exec(question);
  if (quoted?.[1]?.trim()) {
    return `%${quoted[1].trim().slice(0, 100)}%`;
  }
  const words = question
    .toLowerCase()
    .replace(/https?:\/\/\S+/gi, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^\w]/g, ''))
    .filter((w) => w.length > 3 && !STOP.has(w));
  if (!words.length) return null;
  /** Prefer the longest token (e.g. "forbes") — last word was often "read"/"want". */
  const w = words.reduce((a, b) => (a.length >= b.length ? a : b));
  return `%${w.slice(0, 72)}%`;
}

/** Recent message_links for Ask when the user is clearly recalling a shared URL. */
export async function buildSavedLinksRecallPromptSection(
  db: DrizzleDb,
  userId: string,
  question: string,
  now: Date,
  userTimeZone: string | null,
): Promise<string | null> {
  if (!wantsSavedLinksRecall(question)) return null;

  const tz = userTimeZone ?? 'UTC';
  const pattern = searchPatternFromQuestion(question);
  const baseScope = eq(messageLinksTable.userId, userId);

  const rowShape = {
    createdAt: messageLinksTable.createdAt,
    originalUrl: messageLinksTable.originalUrl,
    pageTitle: messageLinksTable.pageTitle,
    structuredSummary: messageLinksTable.structuredSummary,
    contentType: messageLinksTable.contentType,
    fetchStatus: messageLinksTable.fetchStatus,
  };

  let rows = pattern
    ? await db
        .select(rowShape)
        .from(messageLinksTable)
        .where(
          and(
            baseScope,
            or(
              ilike(messageLinksTable.structuredSummary, pattern),
              ilike(messageLinksTable.pageTitle, pattern),
              ilike(messageLinksTable.originalUrl, pattern),
            ),
          ),
        )
        .orderBy(desc(messageLinksTable.createdAt))
        .limit(25)
    : await db
        .select(rowShape)
        .from(messageLinksTable)
        .where(baseScope)
        .orderBy(desc(messageLinksTable.createdAt))
        .limit(25);

  if (pattern && rows.length === 0) {
    rows = await db
      .select(rowShape)
      .from(messageLinksTable)
      .where(baseScope)
      .orderBy(desc(messageLinksTable.createdAt))
      .limit(25);
  }

  if (!rows.length) {
    return '## Saved links from chat\n(No links found yet — nothing has been fetched from URLs in chat.)';
  }

  const lines = rows.map((r, i) => {
    const stamp = formatChatRecallStamp(r.createdAt, now, tz);
    const title = r.pageTitle?.trim() || '(no title)';
    const sum = r.structuredSummary?.trim()
      ? r.structuredSummary.trim().slice(0, 320)
      : '(no summary)';
    return `- [${i + 1}] [${stamp}] ${title} | type: ${r.contentType ?? 'unknown'} | status: ${r.fetchStatus}\n  URL: ${r.originalUrl.slice(0, 500)}${r.originalUrl.length > 500 ? '…' : ''}\n  Summary: ${sum}`;
  });

  return `## Saved links from chat (recent; use for "what link did I save", "find that article", etc.)
These are URLs the user sent in chat; Pem fetched and summarized them. Match the user's wording to the best row. If nothing fits, say so.

${lines.join('\n')}`;
}
