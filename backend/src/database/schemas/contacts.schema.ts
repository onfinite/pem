import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from './users.schema';

export const contactsTable = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    meetingCount: integer('meeting_count').notNull().default(0),
    lastMetAt: timestamp('last_met_at', { withTimezone: true, mode: 'date' }),
    firstMetAt: timestamp('first_met_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_contacts_user_email').on(t.userId, t.email),
    index('ix_contacts_user_name').on(t.userId, t.name),
  ],
);

export type ContactRow = typeof contactsTable.$inferSelect;
