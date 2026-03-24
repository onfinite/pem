import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { relations } from 'drizzle-orm';
import { preps } from './preps';

export const dumps = pgTable('dumps', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    rawText: text('raw_text'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const dumpsRelations = relations(dumps, ({ one, many }) => ({
    user: one(users, {
        fields: [dumps.userId],
        references: [users.id],
    }),
    preps: many(preps),
}));
