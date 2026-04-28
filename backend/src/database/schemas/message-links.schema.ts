import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { messagesTable } from '@/database/schemas/messages.schema';
import { usersTable } from '@/database/schemas/users.schema';

export const MESSAGE_LINK_FETCH_STATUSES = [
  'success',
  'cached',
  'unauthorized',
  'failed',
  'timeout',
  'malformed',
] as const;
export type MessageLinkFetchStatus =
  (typeof MESSAGE_LINK_FETCH_STATUSES)[number];

export const MESSAGE_LINK_CONTENT_TYPES = [
  'product',
  'article',
  'job',
  'recipe',
  'restaurant',
  'video',
  'social',
  'general',
] as const;
export type MessageLinkContentType =
  (typeof MESSAGE_LINK_CONTENT_TYPES)[number];

export const messageLinksTable = pgTable(
  'message_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messagesTable.id, { onDelete: 'cascade' }),
    originalUrl: text('original_url').notNull(),
    /** Normalized URL passed to the reader (tracking params stripped). */
    normalizedFetchUrl: text('normalized_fetch_url').notNull(),
    /** SHA-256 hex of normalized_fetch_url — indexed for cache lookup (avoids btree row-size limits on long URLs). */
    cacheKey: text('cache_key').notNull(),
    canonicalUrl: text('canonical_url'),
    pageTitle: text('page_title'),
    contentType: text('content_type').$type<MessageLinkContentType | null>(),
    /** Jina Reader JSON (`Accept: application/json`), trimmed for size. */
    jinaSnapshot: jsonb('jina_snapshot'),
    structuredSummary: text('structured_summary'),
    extractedMetadata: jsonb('extracted_metadata').$type<Record<
      string,
      unknown
    > | null>(),
    fetchStatus: text('fetch_status').notNull().$type<MessageLinkFetchStatus>(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ix_message_links_message').on(t.messageId),
    index('ix_message_links_user_cache_key_fetched').on(
      t.userId,
      t.cacheKey,
      t.fetchedAt,
    ),
  ],
);

export type MessageLinkRow = typeof messageLinksTable.$inferSelect;
export type MessageLinkInsert = typeof messageLinksTable.$inferInsert;
