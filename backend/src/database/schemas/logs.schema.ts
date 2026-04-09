import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { extractsTable } from './extracts.schema';
import { messagesTable } from './messages.schema';
import { usersTable } from './users.schema';

export const LOG_TYPES = [
  'dump',
  'extract',
  'ask',
  'calendar',
  'user',
  'chat',
] as const;
export type LogType = (typeof LOG_TYPES)[number];

export const logsTable = pgTable(
  'logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    extractId: uuid('extract_id').references(() => extractsTable.id, {
      onDelete: 'set null',
    }),
    messageId: uuid('message_id').references(() => messagesTable.id, {
      onDelete: 'set null',
    }),
    isAgent: boolean('is_agent').notNull().default(false),
    pemNote: text('pem_note'),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    error: jsonb('error').$type<{
      message: string;
      stack?: string;
      code?: string;
    } | null>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_logs_user_created').on(t.userId, t.createdAt),
    index('ix_logs_extract').on(t.extractId),
    index('ix_logs_message').on(t.messageId),
    index('ix_logs_type').on(t.userId, t.type),
  ],
);

export type LogRow = typeof logsTable.$inferSelect;
