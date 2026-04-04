import {
  boolean,
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
 * Composable results also set `result.primaryKind` (same enum + `mixed`).
 * Adaptive card shape is **only** in `result.schema` (e.g. SHOPPING_CARD) — not duplicated here.
 */
export const PREP_TYPES = [
  'search',
  'research',
  'options',
  'draft',
  'mixed',
] as const;
export type PrepType = (typeof PREP_TYPES)[number];

export const PREP_STATUSES = [
  'prepping',
  'ready',
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
    /**
     * Legacy self-FK: child row points at parent. Hub lists only `parent_prep_id` null; new pipeline does not create children.
     */
    parentPrepId: uuid('parent_prep_id'),
    /** Legacy; new preps are always false. */
    isBundle: boolean('is_bundle').notNull().default(false),
    /** Optional emoji prefix for hub row. */
    displayEmoji: text('display_emoji'),
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
  },
  (t) => [
    index('ix_preps_user_id').on(t.userId),
    index('ix_preps_dump_id').on(t.dumpId),
    index('ix_preps_status').on(t.status),
    index('ix_preps_parent_prep_id').on(t.parentPrepId),
  ],
);

export type PrepRow = typeof prepsTable.$inferSelect;
