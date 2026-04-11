import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export type UserPreferences = {
  work_hours?: { start: string; end: string };
  work_days?: number[];
  work_type?: 'office' | 'remote' | 'hybrid';
  personal_windows?: ('evenings' | 'weekends' | 'lunch' | 'mornings')[];
  errand_window?: 'weekend_morning' | 'lunch' | 'after_work';
};

export const usersTable = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email'),
  name: text('name'),
  pushToken: text('push_token'),
  timezone: text('timezone'),
  notificationTime: text('notification_time').default('07:00'),
  summary: text('summary'),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  preferences: jsonb('preferences').$type<UserPreferences>(),
  focusHoursPerWeek: integer('focus_hours_per_week'),
  schedulingConfidence: text('scheduling_confidence'),
  lastBriefDate: timestamp('last_brief_date', { withTimezone: true, mode: 'date' }),
  lastBriefPushDate: timestamp('last_brief_push_date', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export type UserRow = typeof usersTable.$inferSelect;
export type UserInsert = typeof usersTable.$inferInsert;
