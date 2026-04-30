ALTER TABLE "messages" ADD COLUMN "image_keys" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "vision_summary" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "vision_model" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "vision_completed_at" timestamp with time zone;