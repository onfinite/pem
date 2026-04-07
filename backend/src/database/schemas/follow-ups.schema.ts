import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { extractsTable } from './extracts.schema';
import { dumpsTable } from './dumps.schema';
import { usersTable } from './users.schema';

/** At most one row per extract (unique extract_id). */
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
    sourceDumpId: uuid('source_dump_id').references(() => dumpsTable.id, {
      onDelete: 'set null',
    }),
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
