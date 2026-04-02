import {
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { prepsTable } from './preps.schema';

/** One row per tool step during a prep (Vercel AI SDK loop). */
export const agentStepsTable = pgTable(
  'agent_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    prepId: uuid('prep_id')
      .notNull()
      .references(() => prepsTable.id, { onDelete: 'cascade' }),
    stepNumber: integer('step_number').notNull(),
    toolName: text('tool_name'),
    toolInput: json('tool_input').$type<Record<string, unknown>>(),
    toolOutput: json('tool_output').$type<Record<string, unknown> | null>(),
    thinking: text('thinking'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('ix_agent_steps_prep_id').on(t.prepId)],
);

export type AgentStepRow = typeof agentStepsTable.$inferSelect;
