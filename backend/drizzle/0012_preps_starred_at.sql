-- User-starred preps (hub "Starred" view, Gmail-style).
ALTER TABLE "preps" ADD COLUMN IF NOT EXISTS "starred_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "ix_preps_user_starred" ON "preps" ("user_id", "starred_at" DESC NULLS LAST);
