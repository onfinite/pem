-- Backfill period_start/period_end for existing rows that only have urgency values.
-- Run once after applying 0004_lucky_aaron_stack.sql.
-- After verifying, delete this file.

-- urgency='today' with no period dates → set period to today (run day of migration)
UPDATE extracts
SET period_start = date_trunc('day', now() AT TIME ZONE COALESCE(
      (SELECT timezone FROM users WHERE id = extracts.user_id), 'UTC')),
    period_end = date_trunc('day', now() AT TIME ZONE COALESCE(
      (SELECT timezone FROM users WHERE id = extracts.user_id), 'UTC')) + interval '1 day' - interval '1 second',
    period_label = 'today',
    urgency = 'none',
    updated_at = now()
WHERE urgency = 'today'
  AND period_start IS NULL
  AND due_at IS NULL
  AND event_start_at IS NULL
  AND status IN ('inbox', 'snoozed');

-- urgency='this_week' with no period dates → set period to current Mon-Sun
UPDATE extracts
SET period_start = date_trunc('week', now() AT TIME ZONE COALESCE(
      (SELECT timezone FROM users WHERE id = extracts.user_id), 'UTC')),
    period_end = date_trunc('week', now() AT TIME ZONE COALESCE(
      (SELECT timezone FROM users WHERE id = extracts.user_id), 'UTC')) + interval '7 days' - interval '1 second',
    period_label = 'this week',
    urgency = 'none',
    updated_at = now()
WHERE urgency = 'this_week'
  AND period_start IS NULL
  AND status IN ('inbox', 'snoozed');

-- urgency='next_week' with no period dates → set period to next Mon-Sun
UPDATE extracts
SET period_start = date_trunc('week', now() AT TIME ZONE COALESCE(
      (SELECT timezone FROM users WHERE id = extracts.user_id), 'UTC')) + interval '7 days',
    period_end = date_trunc('week', now() AT TIME ZONE COALESCE(
      (SELECT timezone FROM users WHERE id = extracts.user_id), 'UTC')) + interval '14 days' - interval '1 second',
    period_label = 'next week',
    urgency = 'none',
    updated_at = now()
WHERE urgency = 'next_week'
  AND period_start IS NULL
  AND status IN ('inbox', 'snoozed');

-- urgency='next_month' with no period dates → set period to next month
UPDATE extracts
SET period_start = date_trunc('month', now() AT TIME ZONE COALESCE(
      (SELECT timezone FROM users WHERE id = extracts.user_id), 'UTC')) + interval '1 month',
    period_end = date_trunc('month', now() AT TIME ZONE COALESCE(
      (SELECT timezone FROM users WHERE id = extracts.user_id), 'UTC')) + interval '2 months' - interval '1 second',
    period_label = 'next month',
    urgency = 'none',
    updated_at = now()
WHERE urgency = 'next_month'
  AND period_start IS NULL
  AND status IN ('inbox', 'snoozed');

-- For any remaining rows with old urgency values (today/this_week/next_week/next_month)
-- that already have dates, just set urgency to 'none'
UPDATE extracts
SET urgency = 'none',
    updated_at = now()
WHERE urgency IN ('today', 'this_week', 'next_week', 'next_month')
  AND status IN ('inbox', 'snoozed');
