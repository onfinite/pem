import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';

import { messagesTable } from '@/database/schemas/messages.schema';
import { usersTable } from '@/database/schemas/users.schema';

const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return 'vector(1536)';
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(',')
      .map((v) => Number.parseFloat(v));
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
});

export const messageEmbeddingsTable = pgTable(
  'message_embeddings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messagesTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_msg_embed_user').on(t.userId),
    uniqueIndex('ix_msg_embed_message_unique').on(t.messageId),
  ],
);

export type MessageEmbeddingRow = typeof messageEmbeddingsTable.$inferSelect;
export type MessageEmbeddingInsert = typeof messageEmbeddingsTable.$inferInsert;
