import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { dumpsTable } from './dumps.schema';
import { usersTable } from './users.schema';

export const MEMORY_STATUSES = ['active', 'historical'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/** Natural-language memory rows: append-only history; supersede via status. */
export const memoryFactsTable = pgTable(
  'memory_facts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    memoryKey: text('memory_key').notNull(),
    note: text('note').notNull(),
    learnedAt: timestamp('learned_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    sourceDumpId: uuid('source_dump_id').references(() => dumpsTable.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull(),
    provenance: text('provenance'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_memory_facts_user_id').on(t.userId),
    index('ix_memory_facts_user_status_learned').on(
      t.userId,
      t.status,
      t.learnedAt,
    ),
    index('ix_memory_facts_memory_key').on(t.userId, t.memoryKey),
  ],
);

export type MemoryFactRow = typeof memoryFactsTable.$inferSelect;
