CREATE TABLE "prep_run_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prep_id" uuid NOT NULL,
	"step" text NOT NULL,
	"message" text NOT NULL,
	"meta" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prep_run_logs" ADD CONSTRAINT "prep_run_logs_prep_id_preps_id_fk" FOREIGN KEY ("prep_id") REFERENCES "public"."preps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_prep_run_logs_prep_id" ON "prep_run_logs" USING btree ("prep_id");
