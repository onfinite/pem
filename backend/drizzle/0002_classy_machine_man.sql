DROP INDEX "ix_extracts_calendar";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_extracts_calendar" ON "extracts" USING btree ("calendar_connection_id","external_event_id");