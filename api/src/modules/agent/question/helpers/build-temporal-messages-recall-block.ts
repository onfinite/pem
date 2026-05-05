import { and, desc, eq, gte, lte } from 'drizzle-orm';

import type { DrizzleDb } from '@/database/database.module';
import { messagesTable } from '@/database/schemas/index';
import { formatChatRecallStamp } from '@/modules/agent/helpers/format-chat-recall-stamp';
import { visionLineForHumans } from '@/modules/media/photo/helpers/photo-vision-stored';

const LINE_CAP = 1_200;

function formatLine(m: {
  role: string;
  kind: string | null;
  content: string | null;
  transcript: string | null;
  visionSummary: string | null;
}): string {
  if (m.role === 'pem') return (m.content ?? '').slice(0, LINE_CAP);
  if (m.kind === 'image') {
    const cap = (m.content ?? '').trim();
    const vis = visionLineForHumans(m.visionSummary ?? '');
    const visOut = vis.length > 800 ? `${vis.slice(0, 800)}…` : vis;
    const capOut = cap.slice(0, 800);
    if (cap && vis) return `${capOut}\n[Photo: ${visOut}]`.slice(0, LINE_CAP);
    if (vis) return `[Photo: ${visOut}]`.slice(0, LINE_CAP);
    if (cap) return `${capOut} [photo]`.slice(0, LINE_CAP);
    return '[photo]';
  }
  return (m.transcript ?? m.content ?? '').slice(0, LINE_CAP);
}

/** Same “Messages from {period}” slice as Ask when the user’s text implies a time window. */
export async function buildTemporalMessagesRecallBlock(
  db: DrizzleDb,
  userId: string,
  temporalRange: { start: Date; end: Date; label: string },
  now: Date,
  userTimeZone: string | null | undefined,
): Promise<string | null> {
  if (!temporalRange.label) return null;

  const historicalMsgs = await db
    .select({
      role: messagesTable.role,
      kind: messagesTable.kind,
      content: messagesTable.content,
      transcript: messagesTable.transcript,
      visionSummary: messagesTable.visionSummary,
      createdAt: messagesTable.createdAt,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.userId, userId),
        gte(messagesTable.createdAt, temporalRange.start),
        lte(messagesTable.createdAt, temporalRange.end),
      ),
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(30);

  if (historicalMsgs.length === 0) return null;

  const lines = historicalMsgs.map((m) => {
    const text = formatLine(m);
    const stamp = formatChatRecallStamp(m.createdAt, now, userTimeZone ?? null);
    return `- [${stamp}] ${m.role}: ${text.slice(0, LINE_CAP)}`;
  });

  return `Messages from ${temporalRange.label} (${historicalMsgs.length} found):\n${lines.join('\n')}`;
}
