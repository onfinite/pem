import {
  index,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { dumpsTable } from './dumps.schema';
import { usersTable } from './users.schema';

export const PREP_TYPES = ['search', 'research', 'options', 'draft'] as const;
export type PrepType = (typeof PREP_TYPES)[number];

export const PREP_STATUSES = ['prepping', 'ready', 'archived'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

export const prepsTable = pgTable(
  'preps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    dumpId: uuid('dump_id')
      .notNull()
      .references(() => dumpsTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    prepType: text('prep_type').notNull(),
    status: text('status').notNull().default('prepping'),
    summary: text('summary'),
    result: json('result').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('ix_preps_user_id').on(t.userId),
    index('ix_preps_dump_id').on(t.dumpId),
    index('ix_preps_status').on(t.status),
  ],
);

export type PrepRow = typeof prepsTable.$inferSelect;
