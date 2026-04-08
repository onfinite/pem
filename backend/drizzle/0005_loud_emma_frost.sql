CREATE TABLE "reported_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"extract_id" uuid,
	"dump_id" uuid,
	"reason" text NOT NULL,
	"extract_snapshot" jsonb NOT NULL,
	"dump_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reported_issues" ADD CONSTRAINT "reported_issues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reported_issues" ADD CONSTRAINT "reported_issues_extract_id_extracts_id_fk" FOREIGN KEY ("extract_id") REFERENCES "public"."extracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reported_issues" ADD CONSTRAINT "reported_issues_dump_id_dumps_id_fk" FOREIGN KEY ("dump_id") REFERENCES "public"."dumps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_reported_issues_user_id" ON "reported_issues" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_reported_issues_extract_id" ON "reported_issues" USING btree ("extract_id");--> statement-breakpoint
CREATE INDEX "ix_reported_issues_dump_id" ON "reported_issues" USING btree ("dump_id");--> statement-breakpoint
CREATE INDEX "ix_reported_issues_created_at" ON "reported_issues" USING btree ("created_at");