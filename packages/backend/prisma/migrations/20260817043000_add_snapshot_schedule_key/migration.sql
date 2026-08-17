-- Scheduled snapshots need a database-enforced per-user/type/local-day guard so
-- overlapping app instances cannot both pass the pre-create existence check.
ALTER TABLE "Snapshot" ADD COLUMN "scheduledLocalDate" TEXT;

CREATE UNIQUE INDEX "Snapshot_userId_snapshotType_scheduledLocalDate_key"
ON "Snapshot"("userId", "snapshotType", "scheduledLocalDate");
