ALTER TABLE "extracts" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "extracts" SET "closed_at" = COALESCE("done_at", "dismissed_at") WHERE "status" IN ('done', 'dismissed');--> statement-breakpoint
UPDATE "extracts" SET "status" = 'closed' WHERE "status" IN ('done', 'dismissed');--> statement-breakpoint
UPDATE "extracts" SET "tone" = 'holding' WHERE "tone" = 'someday';--> statement-breakpoint
UPDATE "extracts" SET "urgency" = 'holding' WHERE "urgency" = 'someday';--> statement-breakpoint
ALTER TABLE "extracts" DROP COLUMN "done_at";--> statement-breakpoint
ALTER TABLE "extracts" DROP COLUMN "dismissed_at";