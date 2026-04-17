import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { calendarConnectionsTable } from './calendar-connections.schema';
import { listsTable } from './lists.schema';
import { messagesTable } from './messages.schema';
import { usersTable } from './users.schema';

export type RecurrenceRule = {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  by_day?: number[];
  by_month_day?: number;
  until?: string;
  count?: number;
};

export type ExtractMeta = {
  energy_level?: 'low' | 'medium' | 'high' | null;
  is_deadline?: boolean;
  auto_scheduled?: boolean;
  scheduling_reason?: string | null;
  recommended_at?: string | null;
  rsvp_status?: string | null;
};

export const EXTRACT_SOURCES = ['dump', 'calendar'] as const;
export type ExtractSource = (typeof EXTRACT_SOURCES)[number];

export const EXTRACT_STATUSES = [
  'inbox',
  'done',
  'snoozed',
  'dismissed',
] as const;
export type ExtractStatus = (typeof EXTRACT_STATUSES)[number];

export const EXTRACT_TONES = [
  'confident',
  'tentative',
  'someday',
] as const;
export type ExtractTone = (typeof EXTRACT_TONES)[number];

export const EXTRACT_URGENCIES = [
  'someday',
  'none',
] as const;
export type ExtractUrgency = (typeof EXTRACT_URGENCIES)[number];

export const BATCH_KEYS = ['shopping', 'errands', 'follow_ups'] as const;
export type BatchKey = (typeof BATCH_KEYS)[number];

export const extractsTable = pgTable(
  'extracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messagesTable.id, {
      onDelete: 'cascade',
    }),
    source: text('source').notNull().default('dump'),
    extractText: text('text').notNull(),
    originalText: text('original_text').notNull(),
    status: text('status').notNull(),
    tone: text('tone').notNull(),
    urgency: text('urgency').notNull(),
    batchKey: text('batch_key'),
    listId: uuid('list_id').references(() => listsTable.id, {
      onDelete: 'set null',
    }),
    priority: text('priority').$type<'high' | 'medium' | 'low'>(),
    isOrganizer: boolean('is_organizer').default(false),
    reminderAt: timestamp('reminder_at', { withTimezone: true, mode: 'date' }),
    reminderSent: boolean('reminder_sent').default(false),
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
    recommendedAt: timestamp('recommended_at', {
      withTimezone: true,
      mode: 'date',
    }),
    draftText: text('draft_text'),

    externalEventId: text('external_event_id'),
    calendarConnectionId: uuid('calendar_connection_id').references(
      () => calendarConnectionsTable.id,
      { onDelete: 'set null' },
    ),
    eventStartAt: timestamp('event_start_at', {
      withTimezone: true,
      mode: 'date',
    }),
    eventEndAt: timestamp('event_end_at', {
      withTimezone: true,
      mode: 'date',
    }),
    eventLocation: text('event_location'),

    scheduledAt: timestamp('scheduled_at', {
      withTimezone: true,
      mode: 'date',
    }),
    durationMinutes: integer('duration_minutes'),
    autoScheduled: boolean('auto_scheduled').default(false),
    schedulingReason: text('scheduling_reason'),
    recurrenceRule: jsonb('recurrence_rule').$type<RecurrenceRule>(),
    recurrenceParentId: uuid('recurrence_parent_id'),
    rsvpStatus: text('rsvp_status'),
    isAllDay: boolean('is_all_day').default(false),
    isDeadline: boolean('is_deadline').default(false),
    energyLevel: text('energy_level'),
    meta: jsonb('meta').$type<ExtractMeta>().default({}),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_extracts_user_id').on(t.userId),
    index('ix_extracts_message_id').on(t.messageId),
    index('ix_extracts_user_status_urgency').on(t.userId, t.status, t.urgency),
    index('ix_extracts_user_period').on(t.userId, t.status, t.periodStart),
    index('ix_extracts_batch').on(t.userId, t.batchKey),
    index('ix_extracts_list').on(t.userId, t.listId),
    index('ix_extracts_reminder').on(t.reminderAt, t.reminderSent),
    uniqueIndex('uq_extracts_calendar').on(
      t.calendarConnectionId,
      t.externalEventId,
    ),
  ],
);

export type ExtractRow = typeof extractsTable.$inferSelect;
