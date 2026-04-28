import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from '@/database/schemas/users.schema';

export const CALENDAR_PROVIDERS = ['google'] as const;
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

    connectionStatus: text('connection_status').notNull().default('healthy'),
    lastSyncedAt: timestamp('last_synced_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastError: text('last_error'),
    /** Google incremental sync token; null = full sync next time. */
    syncCursor: text('sync_cursor'),

    watchChannelId: text('watch_channel_id'),
    watchResourceId: text('watch_resource_id'),
    watchExpiration: timestamp('watch_expiration', {
      withTimezone: true,
      mode: 'date',
    }),

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
    index('ix_cal_conn_watch_channel').on(t.watchChannelId),
  ],
);

export type CalendarConnectionRow =
  typeof calendarConnectionsTable.$inferSelect;
