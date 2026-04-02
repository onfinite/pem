import {
  boolean,
  json,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** PostgreSQL `user` table. */
export const userTable = pgTable('user', {
  id: serial('id').primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').unique(),
  fullName: text('full_name'),
  isActive: boolean('is_active').notNull().default(true),
  userData: json('user_data').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
});

export type UserRow = typeof userTable.$inferSelect;
export type UserInsert = typeof userTable.$inferInsert;
