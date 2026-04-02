CREATE TABLE "memory_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"memory_key" text NOT NULL,
	"note" text NOT NULL,
	"learned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_dump_id" uuid,
	"source_prep_id" uuid,
	"status" text NOT NULL,
	"provenance" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_facts_status_check" CHECK ("status" IN ('active', 'historical'))
);
--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_source_dump_id_dumps_id_fk" FOREIGN KEY ("source_dump_id") REFERENCES "public"."dumps"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_source_prep_id_preps_id_fk" FOREIGN KEY ("source_prep_id") REFERENCES "public"."preps"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_memory_facts_user_id" ON "memory_facts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "ix_memory_facts_user_status_learned" ON "memory_facts" USING btree ("user_id","status","learned_at" DESC);
--> statement-breakpoint
CREATE INDEX "ix_memory_facts_memory_key" ON "memory_facts" USING btree ("user_id","memory_key");
--> statement-breakpoint
INSERT INTO "memory_facts" ("user_id", "memory_key", "note", "learned_at", "status", "provenance", "source_dump_id", "source_prep_id")
SELECT "user_id", "key", "value", "updated_at", 'active', COALESCE("source", 'migration'), NULL, NULL
FROM "user_profile";
--> statement-breakpoint
DROP TABLE "user_profile";
--> statement-breakpoint
ALTER TABLE "preps" ADD COLUMN "opened_at" timestamp with time zone;
