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
ALTER TABLE "calendar_connections" ADD COLUMN "watch_channel_id" text;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "watch_resource_id" text;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "watch_expiration" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "list_id" uuid;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "priority" text;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "is_organizer" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extracts" ADD COLUMN "reminder_sent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_lists_user_id" ON "lists" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "extracts" ADD CONSTRAINT "extracts_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_cal_conn_watch_channel" ON "calendar_connections" USING btree ("watch_channel_id");--> statement-breakpoint
CREATE INDEX "ix_extracts_list" ON "extracts" USING btree ("user_id","list_id");--> statement-breakpoint
CREATE INDEX "ix_extracts_reminder" ON "extracts" USING btree ("reminder_at","reminder_sent");