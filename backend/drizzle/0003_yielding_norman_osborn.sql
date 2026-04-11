DROP INDEX "ix_msg_embed_message";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_msg_embed_message_unique" ON "message_embeddings" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_messages_user_idempotency" ON "messages" USING btree ("user_id","idempotency_key") WHERE "messages"."idempotency_key" IS NOT NULL;