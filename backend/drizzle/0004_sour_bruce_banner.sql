CREATE TABLE "ask_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"answer_text" text,
	"sources" jsonb NOT NULL,
	"input_kind" text NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ask_turns" ADD CONSTRAINT "ask_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_ask_turns_user_created" ON "ask_turns" USING btree ("user_id","created_at");