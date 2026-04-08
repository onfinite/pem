import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from './users.schema';

export const ASK_INPUT_KINDS = ['text', 'voice'] as const;
export type AskInputKind = (typeof ASK_INPUT_KINDS)[number];

/**
 * User Ask Pem Q&A — one row per question (text or transcribed voice) and Pem's reply.
 * Separate from `logs` for product history / future UI; logs remain for audit.
 */
export const askTurnsTable = pgTable(
  'ask_turns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    questionText: text('question_text').notNull(),
    answerText: text('answer_text'),
    sources: jsonb('sources').$type<{ id: string; text: string }[]>().notNull(),
    inputKind: text('input_kind').notNull().$type<AskInputKind>(),
    error: jsonb('error').$type<{
      message: string;
      stack?: string;
    } | null>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('ix_ask_turns_user_created').on(t.userId, t.createdAt)],
);

export type AskTurnRow = typeof askTurnsTable.$inferSelect;
