import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { dumpsTable } from './dumps.schema';
import { usersTable } from './users.schema';

export const ACTIONABLE_STATUSES = [
  'inbox',
  'done',
  'snoozed',
  'dismissed',
] as const;
export type ActionableStatus = (typeof ACTIONABLE_STATUSES)[number];

export const ACTIONABLE_TONES = [
  'confident',
  'tentative',
  'idea',
  'someday',
] as const;
export type ActionableTone = (typeof ACTIONABLE_TONES)[number];

export const ACTIONABLE_URGENCIES = [
  'today',
  'this_week',
  'someday',
  'none',
] as const;
export type ActionableUrgency = (typeof ACTIONABLE_URGENCIES)[number];

export const BATCH_KEYS = ['shopping', 'calls', 'emails', 'errands'] as const;
export type BatchKey = (typeof BATCH_KEYS)[number];

export const actionablesTable = pgTable(
  'actionables',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    dumpId: uuid('dump_id')
      .notNull()
      .references(() => dumpsTable.id, { onDelete: 'cascade' }),
    actionableText: text('text').notNull(),
    originalText: text('original_text').notNull(),
    status: text('status').notNull(),
    tone: text('tone').notNull(),
    urgency: text('urgency').notNull(),
    batchKey: text('batch_key'),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
    periodStart: timestamp('period_start', {
      withTimezone: true,
      mode: 'date',
    }),
    periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' }),
    periodLabel: text('period_label'),
    timezonePending: boolean('timezone_pending').notNull().default(false),
    snoozedUntil: timestamp('snoozed_until', {
      withTimezone: true,
      mode: 'date',
    }),
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'date' }),
    dismissedAt: timestamp('dismissed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    pemNote: text('pem_note'),
    draftText: text('draft_text'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_actionables_user_id').on(t.userId),
    index('ix_actionables_dump_id').on(t.dumpId),
    index('ix_actionables_user_status_urgency').on(
      t.userId,
      t.status,
      t.urgency,
    ),
    index('ix_actionables_batch').on(t.userId, t.batchKey),
  ],
);

export type ActionableRow = typeof actionablesTable.$inferSelect;
