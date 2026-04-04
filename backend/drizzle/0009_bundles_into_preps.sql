-- Bundle metadata lives on `preps`: parent row (is_bundle) + child rows (parent_prep_id).
-- Drops `bundles` and `bundle_sub_preps`; migrates existing data when present.

ALTER TABLE "preps" ADD COLUMN "parent_prep_id" uuid;
ALTER TABLE "preps" ADD COLUMN "is_bundle" boolean NOT NULL DEFAULT false;
ALTER TABLE "preps" ADD COLUMN "bundle_type" text;
ALTER TABLE "preps" ADD COLUMN "bundle_overview" text;
ALTER TABLE "preps" ADD COLUMN "bundle_detection_reason" text;
ALTER TABLE "preps" ADD COLUMN "display_emoji" text;
ALTER TABLE "preps" ADD COLUMN "sub_prep_key" text;
ALTER TABLE "preps" ADD COLUMN "sub_prep_label" text;
ALTER TABLE "preps" ADD COLUMN "bundle_total_sub_preps" integer;
ALTER TABLE "preps" ADD COLUMN "bundle_completed_sub_preps" integer;
ALTER TABLE "preps" ADD COLUMN "bundle_failed_sub_preps" integer;

UPDATE "preps" p SET
  "sub_prep_key" = bsp."sub_prep_id",
  "display_emoji" = bsp."emoji",
  "sub_prep_label" = bsp."label"
FROM "bundle_sub_preps" bsp
WHERE p."id" = bsp."prep_id";

INSERT INTO "preps" (
  "id",
  "user_id",
  "dump_id",
  "parent_prep_id",
  "is_bundle",
  "bundle_type",
  "title",
  "thought",
  "intent",
  "context",
  "prep_type",
  "status",
  "summary",
  "bundle_overview",
  "bundle_detection_reason",
  "display_emoji",
  "bundle_total_sub_preps",
  "bundle_completed_sub_preps",
  "bundle_failed_sub_preps",
  "created_at",
  "ready_at",
  "error_message",
  "result"
)
SELECT
  b."id",
  b."user_id",
  b."dump_id",
  NULL,
  true,
  b."bundle_type",
  b."title",
  b."title",
  NULL,
  NULL,
  'mixed',
  CASE
    WHEN b."status" = 'ready' THEN 'ready'
    WHEN b."status" = 'failed' THEN 'failed'
    ELSE 'prepping'
  END,
  b."overview",
  b."overview",
  b."detection_reason",
  b."emoji",
  b."total_sub_preps",
  b."completed_sub_preps",
  b."failed_sub_preps",
  b."created_at",
  CASE WHEN b."status" = 'ready' THEN b."completed_at" ELSE NULL END,
  NULL,
  NULL
FROM "bundles" b;

UPDATE "preps" SET "parent_prep_id" = "bundle_id" WHERE "bundle_id" IS NOT NULL;

ALTER TABLE "preps" DROP CONSTRAINT IF EXISTS "preps_bundle_id_fkey";
DROP INDEX IF EXISTS "ix_preps_bundle_id";
ALTER TABLE "preps" DROP COLUMN "bundle_id";

ALTER TABLE "preps" ADD CONSTRAINT "preps_parent_prep_id_fkey" FOREIGN KEY ("parent_prep_id") REFERENCES "preps"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE INDEX "ix_preps_parent_prep_id" ON "preps" ("parent_prep_id");

DROP TABLE "bundle_sub_preps";
DROP TABLE "bundles";
