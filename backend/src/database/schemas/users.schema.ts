import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Pem users — synced from Clerk; `push_token` for Expo; `timezone` IANA (e.g. America/Los_Angeles). */
export const usersTable = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email'),
  name: text('name'),
  pushToken: text('push_token'),
  timezone: text('timezone'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export type UserRow = typeof usersTable.$inferSelect;
export type UserInsert = typeof usersTable.$inferInsert;
