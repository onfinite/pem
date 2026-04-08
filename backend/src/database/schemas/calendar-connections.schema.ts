import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from './users.schema';

export const CALENDAR_PROVIDERS = ['google', 'apple'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const calendarConnectionsTable = pgTable(
  'calendar_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),

    googleAccessToken: text('google_access_token'),
    googleRefreshToken: text('google_refresh_token'),
    googleTokenExpiresAt: timestamp('google_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    googleEmail: text('google_email'),

    /** Which on-device Apple calendars the user selected to sync. */
    appleCalendarIds: jsonb('apple_calendar_ids').$type<string[] | null>(),

    lastSyncedAt: timestamp('last_synced_at', {
      withTimezone: true,
      mode: 'date',
    }),
    /** Google incremental sync token; null = full sync next time. */
    syncCursor: text('sync_cursor'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_cal_conn_user').on(t.userId),
    index('ix_cal_conn_user_provider').on(t.userId, t.provider),
  ],
);

export type CalendarConnectionRow =
  typeof calendarConnectionsTable.$inferSelect;
