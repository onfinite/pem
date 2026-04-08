import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { dumpsTable } from './dumps.schema';
import { extractsTable } from './extracts.schema';
import { usersTable } from './users.schema';

export const LOG_TYPES = ['dump', 'extract', 'ask', 'calendar'] as const;
export type LogType = (typeof LOG_TYPES)[number];

/**
 * Unified audit / trace table.
 * Replaces the old actionable_change_log with broader scope:
 * dump processing, extract lifecycle, ask-pem queries, agent decisions, errors.
 */
export const logsTable = pgTable(
  'logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** Top-level category: dump pipeline, extract lifecycle, or ask-pem query. */
    type: text('type').notNull(),
    extractId: uuid('extract_id').references(() => extractsTable.id, {
      onDelete: 'set null',
    }),
    dumpId: uuid('dump_id').references(() => dumpsTable.id, {
      onDelete: 'set null',
    }),
    /** true = agent-initiated action; false = user-initiated. */
    isAgent: boolean('is_agent').notNull().default(false),
    /** Human-readable note (e.g. agent log note, user action label). */
    pemNote: text('pem_note'),
    /** Structured payload (operation details, patches, commands, etc.). */
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    /** Error details when this log represents a failure. */
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
    index('ix_logs_dump').on(t.dumpId),
    index('ix_logs_type').on(t.userId, t.type),
  ],
);

export type LogRow = typeof logsTable.$inferSelect;
