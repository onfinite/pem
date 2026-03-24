// src/database/schema/preps.ts
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { dumps } from './dumps';
import { prepLogs } from './preps-logs';

export const preps = pgTable('preps', {
    id: uuid('id').defaultRandom().primaryKey(),
    dumpId: uuid('dump_id')
        .notNull()
        .references(() => dumps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status').notNull().default('pending'),
    result: jsonb('result'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
});

export const prepsRelations = relations(preps, ({ one, many }) => ({
    dump: one(dumps, { fields: [preps.dumpId], references: [dumps.id] }),
    user: one(users, { fields: [preps.userId], references: [users.id] }),
    logs: many(prepLogs),
}));
