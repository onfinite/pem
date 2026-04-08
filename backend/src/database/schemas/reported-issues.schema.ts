import {
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

/**
 * User-reported problems with an extract — full snapshots for reproducing
 * extraction / classification issues without relying on live rows.
 */
export const reportedIssuesTable = pgTable(
  'reported_issues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    extractId: uuid('extract_id').references(() => extractsTable.id, {
      onDelete: 'set null',
    }),
    dumpId: uuid('dump_id').references(() => dumpsTable.id, {
      onDelete: 'set null',
    }),
    /** User explanation (what was wrong). */
    reason: text('reason').notNull(),
    /** API-shaped extract fields at report time + internal ids for calendar linkage. */
    extractSnapshot: jsonb('extract_snapshot')
      .notNull()
      .$type<Record<string, unknown>>(),
    /**
     * Source dump fields at report time (raw text, polish, pipeline context).
     * Null when the extract came from calendar only.
     */
    dumpSnapshot: jsonb('dump_snapshot').$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_reported_issues_user_id').on(t.userId),
    index('ix_reported_issues_extract_id').on(t.extractId),
    index('ix_reported_issues_dump_id').on(t.dumpId),
    index('ix_reported_issues_created_at').on(t.createdAt),
  ],
);

export type ReportedIssueRow = typeof reportedIssuesTable.$inferSelect;
