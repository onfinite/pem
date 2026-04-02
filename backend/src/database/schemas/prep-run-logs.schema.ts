import {
  index,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { prepsTable } from './preps.schema';

/** Append-only timeline for what the prep agent did (search, LLM, errors). */
export const prepRunLogsTable = pgTable(
  'prep_run_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    prepId: uuid('prep_id')
      .notNull()
      .references(() => prepsTable.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    message: text('message').notNull(),
    meta: json('meta').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('ix_prep_run_logs_prep_id').on(t.prepId)],
);

export type PrepRunLogRow = typeof prepRunLogsTable.$inferSelect;
