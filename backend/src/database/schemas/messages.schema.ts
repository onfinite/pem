import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from './users.schema';

export const MESSAGE_ROLES = ['user', 'pem'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_KINDS = ['text', 'voice', 'brief'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const TRIAGE_CATEGORIES = [
  'trivial',
  'question_only',
  'needs_agent',
] as const;
export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];

export const PROCESSING_STATUSES = [
  'pending',
  'processing',
  'done',
  'failed',
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const messagesTable = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    role: text('role').notNull().$type<MessageRole>(),
    kind: text('kind').notNull().$type<MessageKind>(),
    content: text('content'),
    voiceUrl: text('voice_url'),
    audioKey: text('audio_key'),
    transcript: text('transcript'),
    triageCategory: text('triage_category').$type<TriageCategory>(),
    processingStatus: text('processing_status').$type<ProcessingStatus>(),
    polishedText: text('polished_text'),
    parentMessageId: uuid('parent_message_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_messages_user_created').on(t.userId, t.createdAt),
    index('ix_messages_user_role').on(t.userId, t.role),
    index('ix_messages_parent').on(t.parentMessageId),
  ],
);

export type MessageRow = typeof messagesTable.$inferSelect;
export type MessageInsert = typeof messagesTable.$inferInsert;
