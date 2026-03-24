// src/database/schema/prep-logs.ts
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { preps } from './preps';

export const prepLogs = pgTable('prep_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    prepId: uuid('prep_id')
        .notNull()
        .references(() => preps.id, { onDelete: 'cascade' }),
    action: text('action').notNull(), // search | research | draft | reasoning | retry | error | debug | tool_call
    input: jsonb('input'), // what was sent
    output: jsonb('output'), // what came back
    status: text('status').notNull(), // success | failed | retrying
    note: text('note'), // agent's reasoning in plain text
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const prepLogsRelations = relations(prepLogs, ({ one }) => ({
    prep: one(preps, { fields: [prepLogs.prepId], references: [preps.id] }),
}));
