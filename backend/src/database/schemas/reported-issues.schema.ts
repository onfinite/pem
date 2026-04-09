import {
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
    messageId: uuid('message_id').references(() => messagesTable.id, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull(),
    extractSnapshot: jsonb('extract_snapshot')
      .notNull()
      .$type<Record<string, unknown>>(),
    messageSnapshot: jsonb('message_snapshot').$type<Record<
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
    index('ix_reported_issues_message_id').on(t.messageId),
    index('ix_reported_issues_created_at').on(t.createdAt),
  ],
);

export type ReportedIssueRow = typeof reportedIssuesTable.$inferSelect;
