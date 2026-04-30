CREATE TABLE "message_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"original_url" text NOT NULL,
	"normalized_fetch_url" text NOT NULL,
	"canonical_url" text,
	"page_title" text,
	"content_type" text,
	"jina_content" text,
	"structured_summary" text,
	"extracted_metadata" jsonb,
	"fetch_status" text NOT NULL,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_links" ADD CONSTRAINT "message_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_links" ADD CONSTRAINT "message_links_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_message_links_message" ON "message_links" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ix_message_links_user_norm_fetch_fetched" ON "message_links" USING btree ("user_id","normalized_fetch_url","fetched_at");