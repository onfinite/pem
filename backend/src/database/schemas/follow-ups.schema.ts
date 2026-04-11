import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { extractsTable } from './extracts.schema';
import { messagesTable } from './messages.schema';
import { usersTable } from './users.schema';

/** @deprecated — no longer used in code. Table kept for Drizzle snapshot consistency. */
export const followUpsTable = pgTable(
  'follow_ups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    extractId: uuid('extract_id')
      .notNull()
      .unique()
      .references(() => extractsTable.id, { onDelete: 'cascade' }),
    note: text('note'),
    recommendedAt: timestamp('recommended_at', {
      withTimezone: true,
      mode: 'date',
    }),
    sourceMessageId: uuid('source_message_id').references(
      () => messagesTable.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_follow_ups_user_id').on(t.userId),
    index('ix_follow_ups_recommended_at').on(t.userId, t.recommendedAt),
  ],
);

export type FollowUpRow = typeof followUpsTable.$inferSelect;
