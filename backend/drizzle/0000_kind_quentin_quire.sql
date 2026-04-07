CREATE TABLE "dumps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"polished_text" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"additional_context" jsonb,
	"agent_assumptions" jsonb
);
--> statement-breakpoint
CREATE TABLE "extracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dump_id" uuid NOT NULL,
	"text" text NOT NULL,
	"original_text" text NOT NULL,
	"status" text NOT NULL,
	"tone" text NOT NULL,
	"urgency" text NOT NULL,
	"batch_key" text,
	"due_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"period_label" text,
	"timezone_pending" boolean DEFAULT false NOT NULL,
	"snoozed_until" timestamp with time zone,
	"done_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"pem_note" text,
	"recommended_at" timestamp with time zone,
	"draft_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"extract_id" uuid NOT NULL,
	"note" text,
	"recommended_at" timestamp with time zone,
	"source_dump_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_ups_extract_id_unique" UNIQUE("extract_id")
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"extract_id" uuid,
	"dump_id" uuid,
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
	"source_dump_id" uuid,
	"status" text NOT NULL,
	"provenance" text,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "dumps" ADD CONSTRAINT "dumps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracts" ADD CONSTRAINT "extracts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracts" ADD CONSTRAINT "extracts_dump_id_dumps_id_fk" FOREIGN KEY ("dump_id") REFERENCES "public"."dumps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_extract_id_extracts_id_fk" FOREIGN KEY ("extract_id") REFERENCES "public"."extracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_source_dump_id_dumps_id_fk" FOREIGN KEY ("source_dump_id") REFERENCES "public"."dumps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_extract_id_extracts_id_fk" FOREIGN KEY ("extract_id") REFERENCES "public"."extracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_dump_id_dumps_id_fk" FOREIGN KEY ("dump_id") REFERENCES "public"."dumps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_source_dump_id_dumps_id_fk" FOREIGN KEY ("source_dump_id") REFERENCES "public"."dumps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_dumps_user_id" ON "dumps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_extracts_user_id" ON "extracts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_extracts_dump_id" ON "extracts" USING btree ("dump_id");--> statement-breakpoint
CREATE INDEX "ix_extracts_user_status_urgency" ON "extracts" USING btree ("user_id","status","urgency");--> statement-breakpoint
CREATE INDEX "ix_extracts_batch" ON "extracts" USING btree ("user_id","batch_key");--> statement-breakpoint
CREATE INDEX "ix_follow_ups_user_id" ON "follow_ups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_follow_ups_recommended_at" ON "follow_ups" USING btree ("user_id","recommended_at");--> statement-breakpoint
CREATE INDEX "ix_logs_user_created" ON "logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_logs_extract" ON "logs" USING btree ("extract_id");--> statement-breakpoint
CREATE INDEX "ix_logs_dump" ON "logs" USING btree ("dump_id");--> statement-breakpoint
CREATE INDEX "ix_logs_type" ON "logs" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "ix_memory_facts_user_id" ON "memory_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_memory_facts_user_status_learned" ON "memory_facts" USING btree ("user_id","status","learned_at");--> statement-breakpoint
CREATE INDEX "ix_memory_facts_memory_key" ON "memory_facts" USING btree ("user_id","memory_key");