import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from './users.schema';

/** Key-value facts about a user for agent remember/save. */
export const userProfileTable = pgTable(
  'user_profile',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_user_profile_user_id').on(t.userId),
    uniqueIndex('ux_user_profile_user_key').on(t.userId, t.key),
  ],
);

export type UserProfileRow = typeof userProfileTable.$inferSelect;
