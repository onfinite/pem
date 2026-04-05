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

/**
 * Hub bucket for lists, filters, and initial row before the agent finishes.
 * Structured formatter sets `result.primaryKind` (search | research | options | draft).
 * Multi-block output uses **research** or the dominant kind.
 * **`prep_type: composite`** = multi-section intelligent brief (`result.schema` === COMPOSITE_BRIEF).
 * Adaptive card shape is **only** in `result.schema` (e.g. SHOPPING_CARD) — not duplicated here.
 */
export const PREP_TYPES = [
  'search',
  'research',
  'options',
  'draft',
  'composite',
] as const;
export type PrepType = (typeof PREP_TYPES)[number];

export const PREP_STATUSES = [
  'prepping',
  'ready',
  /** User finished with this prep (`done_at` set); Done hub, not Inbox. */
  'done',
  'archived',
  'failed',
] as const;
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
    /** Short card label — kept for backward compatibility; prefer `thought`. */
    title: text('title').notNull(),
    /** One extracted actionable line from the dump (agentic flow). */
    thought: text('thought').notNull().default(''),
    /**
     * Per-thought intent after split (`IntentClassifierAgent`).
     * See `.cursor/rules/pem-intake-routing.mdc`.
     */
    intent: text('intent'),
    /** Enriched context: profile, intent, optional legacy keys, etc. */
    context: json('context').$type<Record<string, unknown>>(),
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
    /** First time user opened prep detail; null = unread (ready preps). */
    openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }),
    /** User starred for hub; null = not starred. */
    starredAt: timestamp('starred_at', { withTimezone: true, mode: 'date' }),
    /** Set when `status` becomes `done` (cleared when returned to Inbox or archived). */
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('ix_preps_user_id').on(t.userId),
    index('ix_preps_dump_id').on(t.dumpId),
    index('ix_preps_status').on(t.status),
    index('ix_preps_user_starred').on(t.userId, t.starredAt),
  ],
);

export type PrepRow = typeof prepsTable.$inferSelect;
