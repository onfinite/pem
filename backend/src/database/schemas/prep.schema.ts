import {
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { dumpTable } from './dump.schema';
import { userTable } from './user.schema';

export const prepTable = pgTable(
  'prep',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => userTable.id),
    dumpId: integer('dump_id')
      .notNull()
      .references(() => dumpTable.id),
    title: text('title').notNull(),
    result: json('result').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (t) => [
    index('ix_prep_user_id').on(t.userId),
    index('ix_prep_dump_id').on(t.dumpId),
  ],
);
