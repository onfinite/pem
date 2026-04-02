-- Migrate from legacy serial tables (0000_initial) to Pem UUID schema.
DROP TABLE IF EXISTS "prep" CASCADE;
DROP TABLE IF EXISTS "dump" CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text,
	"name" text,
	"push_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "dumps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"transcript" text NOT NULL,
	"audio_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dump_id" uuid NOT NULL,
	"title" text NOT NULL,
	"prep_type" text NOT NULL,
	"status" text DEFAULT 'prepping' NOT NULL,
	"summary" text,
	"result" json,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dumps" ADD CONSTRAINT "dumps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preps" ADD CONSTRAINT "preps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preps" ADD CONSTRAINT "preps_dump_id_dumps_id_fk" FOREIGN KEY ("dump_id") REFERENCES "public"."dumps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_dumps_user_id" ON "dumps" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "ix_preps_user_id" ON "preps" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "ix_preps_dump_id" ON "preps" USING btree ("dump_id");
--> statement-breakpoint
CREATE INDEX "ix_preps_status" ON "preps" USING btree ("status");
