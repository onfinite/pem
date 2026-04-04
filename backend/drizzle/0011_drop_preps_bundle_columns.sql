-- Legacy bundle parent/child columns removed from Drizzle schema; drop if still present.
ALTER TABLE "preps" DROP CONSTRAINT IF EXISTS "preps_parent_prep_id_fkey";
DROP INDEX IF EXISTS "ix_preps_parent_prep_id";
ALTER TABLE "preps" DROP COLUMN IF EXISTS "parent_prep_id";
ALTER TABLE "preps" DROP COLUMN IF EXISTS "is_bundle";
