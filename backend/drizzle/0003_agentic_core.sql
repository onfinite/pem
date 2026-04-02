CREATE TABLE "user_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_user_profile_user_id" ON "user_profile" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ux_user_profile_user_key" ON "user_profile" USING btree ("user_id","key");
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prep_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"tool_name" text,
	"tool_input" json,
	"tool_output" json,
	"thinking" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_prep_id_preps_id_fk" FOREIGN KEY ("prep_id") REFERENCES "public"."preps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_agent_steps_prep_id" ON "agent_steps" USING btree ("prep_id");
--> statement-breakpoint
ALTER TABLE "preps" ADD COLUMN "thought" text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "preps" SET "thought" = "title" WHERE "thought" = '';
--> statement-breakpoint
ALTER TABLE "preps" ADD COLUMN "context" json;
--> statement-breakpoint
ALTER TABLE "preps" ADD COLUMN "render_type" text;
