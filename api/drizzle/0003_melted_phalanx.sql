CREATE TABLE "prep_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prep_id" uuid NOT NULL,
	"action" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prep_logs" ADD CONSTRAINT "prep_logs_prep_id_preps_id_fk" FOREIGN KEY ("prep_id") REFERENCES "public"."preps"("id") ON DELETE cascade ON UPDATE no action;