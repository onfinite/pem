import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { usersTable } from './users.schema';

/** Dump pipeline: LLM extraction + actionables until done or error. */
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
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('ix_dumps_user_id').on(t.userId)],
);

export type DumpRow = typeof dumpsTable.$inferSelect;
