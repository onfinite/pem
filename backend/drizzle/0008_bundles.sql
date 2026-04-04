CREATE TABLE "bundles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
  "dump_id" uuid NOT NULL REFERENCES "dumps"("id") ON DELETE cascade ON UPDATE no action,
  "bundle_type" text NOT NULL,
  "title" text NOT NULL,
  "emoji" text,
  "overview" text,
  "detection_reason" text,
  "status" text NOT NULL DEFAULT 'prepping',
  "total_sub_preps" integer NOT NULL DEFAULT 0,
  "completed_sub_preps" integer NOT NULL DEFAULT 0,
  "failed_sub_preps" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE INDEX "ix_bundles_user_id" ON "bundles" USING btree ("user_id");
CREATE INDEX "ix_bundles_dump_id" ON "bundles" USING btree ("dump_id");

CREATE TABLE "bundle_sub_preps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bundle_id" uuid NOT NULL REFERENCES "bundles"("id") ON DELETE cascade ON UPDATE no action,
  "sub_prep_id" text NOT NULL,
  "label" text NOT NULL,
  "emoji" text,
  "prep_id" uuid NOT NULL UNIQUE REFERENCES "preps"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX "ix_bundle_sub_preps_bundle_id" ON "bundle_sub_preps" USING btree ("bundle_id");

ALTER TABLE "preps" ADD COLUMN "bundle_id" uuid REFERENCES "bundles"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "ix_preps_bundle_id" ON "preps" USING btree ("bundle_id");
