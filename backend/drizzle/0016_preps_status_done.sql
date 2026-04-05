-- Done hub: `status = 'done'` with `done_at` (parallel to `archived` + `archived_at`).
UPDATE "preps"
SET "status" = 'done'
WHERE "status" = 'ready'
  AND "done_at" IS NOT NULL;

UPDATE "preps"
SET "done_at" = COALESCE("done_at", "ready_at", NOW())
WHERE "status" = 'done'
  AND "done_at" IS NULL;
