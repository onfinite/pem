-- Bundle parents are normal preps: progress comes from child rows, not denormalized counters.
-- Metadata moves into `context` where needed (bundle_type, detection reason, sub_prep_key).

UPDATE "preps"
SET "summary" = COALESCE(
  NULLIF(trim(COALESCE("summary", '')), ''),
  "bundle_overview"
)
WHERE "is_bundle" = true AND "bundle_overview" IS NOT NULL;

UPDATE "preps"
SET "context" = jsonb_set(
  COALESCE("context"::jsonb, '{}'::jsonb),
  '{bundle_type}',
  to_jsonb("bundle_type"),
  true
)
WHERE "is_bundle" = true AND "bundle_type" IS NOT NULL;

UPDATE "preps"
SET "context" = jsonb_set(
  COALESCE("context"::jsonb, '{}'::jsonb),
  '{bundle_detection_reason}',
  to_jsonb("bundle_detection_reason"),
  true
)
WHERE "is_bundle" = true AND "bundle_detection_reason" IS NOT NULL;

UPDATE "preps"
SET "context" = jsonb_set(
  COALESCE("context"::jsonb, '{}'::jsonb),
  '{sub_prep_key}',
  to_jsonb("sub_prep_key"),
  true
)
WHERE "parent_prep_id" IS NOT NULL AND "sub_prep_key" IS NOT NULL;

ALTER TABLE "preps" DROP COLUMN IF EXISTS "bundle_type";
ALTER TABLE "preps" DROP COLUMN IF EXISTS "bundle_overview";
ALTER TABLE "preps" DROP COLUMN IF EXISTS "bundle_detection_reason";
ALTER TABLE "preps" DROP COLUMN IF EXISTS "sub_prep_key";
ALTER TABLE "preps" DROP COLUMN IF EXISTS "sub_prep_label";
ALTER TABLE "preps" DROP COLUMN IF EXISTS "bundle_total_sub_preps";
ALTER TABLE "preps" DROP COLUMN IF EXISTS "bundle_completed_sub_preps";
ALTER TABLE "preps" DROP COLUMN IF EXISTS "bundle_failed_sub_preps";
