import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from '@/database/schemas/users.schema';

/** Maps (user, SHA-256 of bytes) → canonical R2 key for exact-duplicate chat images. */
export const chatImageHashesTable = pgTable(
  'chat_image_hashes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    contentSha256: text('content_sha256').notNull(),
    imageKey: text('image_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('ix_chat_image_hashes_user_sha256').on(
      t.userId,
      t.contentSha256,
    ),
    index('ix_chat_image_hashes_user').on(t.userId),
  ],
);

export type ChatImageHashRow = typeof chatImageHashesTable.$inferSelect;
