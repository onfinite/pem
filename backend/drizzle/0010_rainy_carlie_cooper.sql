CREATE TABLE "chat_image_hashes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_sha256" text NOT NULL,
	"image_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_image_hashes" ADD CONSTRAINT "chat_image_hashes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_chat_image_hashes_user_sha256" ON "chat_image_hashes" USING btree ("user_id","content_sha256");--> statement-breakpoint
CREATE INDEX "ix_chat_image_hashes_user" ON "chat_image_hashes" USING btree ("user_id");