ALTER TABLE "extracts" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
CREATE INDEX "ix_extracts_user_period" ON "extracts" USING btree ("user_id","status","period_start");