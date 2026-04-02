import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { userTable } from './user.schema';

export const dumpTable = pgTable(
  'dump',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => userTable.id),
    content: text('content'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (t) => [index('ix_dump_user_id').on(t.userId)],
);
