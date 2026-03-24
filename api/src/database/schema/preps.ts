// src/database/schema/preps.ts
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { dumps } from './dumps';

export const preps = pgTable('preps', {
    id: uuid('id').defaultRandom().primaryKey(),
    dumpId: uuid('dump_id')
        .notNull()
        .references(() => dumps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // search | research | options | draft
    status: text('status').notNull().default('pending'), // pending | processing | done | failed
    result: jsonb('result'), // null until done
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'), // null until done
});

export const prepsRelations = relations(preps, ({ one }) => ({
    dump: one(dumps, { fields: [preps.dumpId], references: [dumps.id] }),
    user: one(users, { fields: [preps.userId], references: [users.id] }),
}));
