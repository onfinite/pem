CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"google_access_token" text,
	"google_refresh_token" text,
	"google_token_expires_at" timestamp with time zone,
	"google_email" text,
	"apple_calendar_ids" jsonb,
	"last_synced_at" timestamp with time zone,
	"sync_cursor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extracts" ALTER COLUMN "dump_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "source" text DEFAULT 'dump' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "external_event_id" text;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "calendar_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "event_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "event_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "event_location" text;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_cal_conn_user" ON "calendar_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_cal_conn_user_provider" ON "calendar_connections" USING btree ("user_id","provider");--> statement-breakpoint
ALTER TABLE "extracts" ADD CONSTRAINT "extracts_calendar_connection_id_calendar_connections_id_fk" FOREIGN KEY ("calendar_connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_extracts_calendar" ON "extracts" USING btree ("calendar_connection_id","external_event_id");