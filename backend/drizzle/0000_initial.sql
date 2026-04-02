CREATE TABLE "dump" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prep" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"dump_id" integer NOT NULL,
	"title" text NOT NULL,
	"result" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text,
	"full_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"user_data" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "dump" ADD CONSTRAINT "dump_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep" ADD CONSTRAINT "prep_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep" ADD CONSTRAINT "prep_dump_id_dump_id_fk" FOREIGN KEY ("dump_id") REFERENCES "public"."dump"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_dump_user_id" ON "dump" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_prep_user_id" ON "prep" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_prep_dump_id" ON "prep" USING btree ("dump_id");