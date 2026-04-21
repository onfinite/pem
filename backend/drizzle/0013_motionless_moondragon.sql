DROP INDEX IF EXISTS "ix_message_links_user_norm_fetch_fetched";--> statement-breakpoint
ALTER TABLE "message_links" ADD COLUMN "cache_key" text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
UPDATE "message_links" SET "cache_key" = encode(digest("normalized_fetch_url", 'sha256'), 'hex') WHERE "cache_key" = '';--> statement-breakpoint
ALTER TABLE "message_links" ALTER COLUMN "cache_key" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "ix_message_links_user_cache_key_fetched" ON "message_links" USING btree ("user_id","cache_key","fetched_at");
