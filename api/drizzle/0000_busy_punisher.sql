CREATE TABLE "chat_image_hashes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_sha256" text NOT NULL,
	"image_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"google_access_token" text,
	"google_refresh_token" text,
	"google_token_expires_at" timestamp with time zone,
	"google_email" text,
	"connection_status" text DEFAULT 'healthy' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"sync_cursor" text,
	"watch_channel_id" text,
	"watch_resource_id" text,
	"watch_expiration" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"meeting_count" integer DEFAULT 0 NOT NULL,
	"last_met_at" timestamp with time zone,
	"first_met_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid,
	"source" text DEFAULT 'dump' NOT NULL,
	"text" text NOT NULL,
	"original_text" text NOT NULL,
	"status" text NOT NULL,
	"tone" text NOT NULL,
	"urgency" text NOT NULL,
	"batch_key" text,
	"list_id" uuid,
	"priority" text,
	"is_organizer" boolean DEFAULT false,
	"reminder_at" timestamp with time zone,
	"reminder_sent" boolean DEFAULT false,
	"due_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"period_label" text,
	"timezone_pending" boolean DEFAULT false NOT NULL,
	"snoozed_until" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"pem_note" text,
	"recommended_at" timestamp with time zone,
	"external_event_id" text,
	"calendar_connection_id" uuid,
	"event_start_at" timestamp with time zone,
	"event_end_at" timestamp with time zone,
	"event_location" text,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"auto_scheduled" boolean DEFAULT false,
	"scheduling_reason" text,
	"recurrence_rule" jsonb,
	"recurrence_parent_id" uuid,
	"rsvp_status" text,
	"is_all_day" boolean DEFAULT false,
	"is_deadline" boolean DEFAULT false,
	"energy_level" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"is_default" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"extract_id" uuid,
	"message_id" uuid,
	"is_agent" boolean DEFAULT false NOT NULL,
	"pem_note" text,
	"payload" jsonb,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"memory_key" text NOT NULL,
	"note" text NOT NULL,
	"learned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_message_id" uuid,
	"status" text NOT NULL,
	"provenance" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"original_url" text NOT NULL,
	"normalized_fetch_url" text NOT NULL,
	"cache_key" text NOT NULL,
	"canonical_url" text,
	"page_title" text,
	"content_type" text,
	"jina_snapshot" jsonb,
	"structured_summary" text,
	"extracted_metadata" jsonb,
	"fetch_status" text NOT NULL,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"content" text,
	"voice_url" text,
	"audio_key" text,
	"transcript" text,
	"triage_category" text,
	"processing_status" text,
	"polished_text" text,
	"summary" text,
	"parent_message_id" uuid,
	"metadata" jsonb,
	"image_keys" jsonb,
	"vision_summary" text,
	"vision_model" text,
	"vision_completed_at" timestamp with time zone,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reported_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"extract_id" uuid,
	"message_id" uuid,
	"reason" text NOT NULL,
	"extract_snapshot" jsonb NOT NULL,
	"message_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text,
	"name" text,
	"push_token" text,
	"timezone" text,
	"notification_time" text DEFAULT '07:00',
	"summary" text,
	"onboarding_completed" boolean DEFAULT false,
	"preferences" jsonb,
	"focus_hours_per_week" integer,
	"scheduling_confidence" text,
	"last_brief_date" timestamp with time zone,
	"last_brief_push_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "chat_image_hashes" ADD CONSTRAINT "chat_image_hashes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracts" ADD CONSTRAINT "extracts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracts" ADD CONSTRAINT "extracts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracts" ADD CONSTRAINT "extracts_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracts" ADD CONSTRAINT "extracts_calendar_connection_id_calendar_connections_id_fk" FOREIGN KEY ("calendar_connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_extract_id_extracts_id_fk" FOREIGN KEY ("extract_id") REFERENCES "public"."extracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_embeddings" ADD CONSTRAINT "message_embeddings_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_embeddings" ADD CONSTRAINT "message_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_links" ADD CONSTRAINT "message_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_links" ADD CONSTRAINT "message_links_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reported_issues" ADD CONSTRAINT "reported_issues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reported_issues" ADD CONSTRAINT "reported_issues_extract_id_extracts_id_fk" FOREIGN KEY ("extract_id") REFERENCES "public"."extracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reported_issues" ADD CONSTRAINT "reported_issues_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_chat_image_hashes_user_sha256" ON "chat_image_hashes" USING btree ("user_id","content_sha256");--> statement-breakpoint
CREATE INDEX "ix_chat_image_hashes_user" ON "chat_image_hashes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_cal_conn_user" ON "calendar_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_cal_conn_user_provider" ON "calendar_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "ix_cal_conn_watch_channel" ON "calendar_connections" USING btree ("watch_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contacts_user_email" ON "contacts" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "ix_contacts_user_name" ON "contacts" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "ix_extracts_user_id" ON "extracts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_extracts_message_id" ON "extracts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ix_extracts_user_status_urgency" ON "extracts" USING btree ("user_id","status","urgency");--> statement-breakpoint
CREATE INDEX "ix_extracts_user_period" ON "extracts" USING btree ("user_id","status","period_start");--> statement-breakpoint
CREATE INDEX "ix_extracts_batch" ON "extracts" USING btree ("user_id","batch_key");--> statement-breakpoint
CREATE INDEX "ix_extracts_list" ON "extracts" USING btree ("user_id","list_id");--> statement-breakpoint
CREATE INDEX "ix_extracts_reminder" ON "extracts" USING btree ("reminder_at","reminder_sent");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_extracts_calendar" ON "extracts" USING btree ("calendar_connection_id","external_event_id");--> statement-breakpoint
CREATE INDEX "ix_lists_user_id" ON "lists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_logs_user_created" ON "logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_logs_extract" ON "logs" USING btree ("extract_id");--> statement-breakpoint
CREATE INDEX "ix_logs_message" ON "logs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ix_logs_type" ON "logs" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "ix_memory_facts_user_id" ON "memory_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_memory_facts_user_status_learned" ON "memory_facts" USING btree ("user_id","status","learned_at");--> statement-breakpoint
CREATE INDEX "ix_memory_facts_memory_key" ON "memory_facts" USING btree ("user_id","memory_key");--> statement-breakpoint
CREATE INDEX "ix_msg_embed_user" ON "message_embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_msg_embed_message_unique" ON "message_embeddings" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ix_message_links_message" ON "message_links" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ix_message_links_user_cache_key_fetched" ON "message_links" USING btree ("user_id","cache_key","fetched_at");--> statement-breakpoint
CREATE INDEX "ix_messages_user_created" ON "messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_messages_user_role" ON "messages" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "ix_messages_parent" ON "messages" USING btree ("parent_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_messages_user_idempotency" ON "messages" USING btree ("user_id","idempotency_key") WHERE "messages"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_reported_issues_user_id" ON "reported_issues" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_reported_issues_extract_id" ON "reported_issues" USING btree ("extract_id");--> statement-breakpoint
CREATE INDEX "ix_reported_issues_message_id" ON "reported_issues" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ix_reported_issues_created_at" ON "reported_issues" USING btree ("created_at");