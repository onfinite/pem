import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from './users.schema';

/** Dump pipeline: LLM extraction + extracts until done or error. */
export const DUMP_STATUSES = ['processing', 'processed', 'failed'] as const;
export type DumpStatus = (typeof DUMP_STATUSES)[number];

export const dumpsTable = pgTable(
  'dumps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** Raw dump text (column name `text` in Postgres). */
    dumpText: text('text').notNull(),
    /** Single AI-polished narrative of the whole dump; null until extraction completes. */
    polishedText: text('polished_text'),
    /**
     * `processing` from insert until extraction finishes or errors;
     * `processed` when polished text + actionables are written and events emitted;
     * `failed` when extraction throws (job may retry — status returns to `processing` on retry).
     */
    status: text('status').notNull().default('processing'),
    /** Set when status is `failed` — for support / UI (truncated server-side). Cleared on retry. */
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    /** Snapshot of memory + open-task context used for this extraction run (debugging / audit). */
    additionalContext: jsonb('additional_context').$type<Record<
      string,
      unknown
    > | null>(),
    /** Explicit agent guesses (date interpretations, merge rationale, etc.). */
    agentAssumptions: jsonb('agent_assumptions').$type<
      unknown[] | Record<string, unknown> | null
    >(),
    /** Object key in R2 for the original audio recording; null for text-only dumps. */
    audioKey: text('audio_key'),
  },
  (t) => [index('ix_dumps_user_id').on(t.userId)],
);

export type DumpRow = typeof dumpsTable.$inferSelect;
