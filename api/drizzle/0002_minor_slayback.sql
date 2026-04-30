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
ALTER TABLE "calendar_connections" ADD COLUMN "connection_status" text DEFAULT 'healthy' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "auto_scheduled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "scheduling_reason" text;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "recurrence_rule" jsonb;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "recurrence_parent_id" uuid;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "rsvp_status" text;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "is_all_day" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "is_deadline" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "energy_level" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferences" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "focus_hours_per_week" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scheduling_confidence" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contacts_user_email" ON "contacts" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "ix_contacts_user_name" ON "contacts" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "calendar_connections" DROP COLUMN "apple_calendar_ids";