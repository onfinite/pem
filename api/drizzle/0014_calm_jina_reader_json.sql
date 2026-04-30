ALTER TABLE "message_links" DROP COLUMN "jina_content";--> statement-breakpoint
ALTER TABLE "message_links" ADD COLUMN "jina_snapshot" jsonb;
