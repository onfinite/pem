import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { usersTable } from './users.schema';

export const dumpsTable = pgTable(
  'dumps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    transcript: text('transcript').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('ix_dumps_user_id').on(t.userId)],
);

export type DumpRow = typeof dumpsTable.$inferSelect;
