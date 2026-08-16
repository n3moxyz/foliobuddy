-- AlterTable
-- Per-user daily snapshot time. Defaults reproduce the previous global schedule
-- (5am Asia/Singapore) so existing users see no change.
ALTER TABLE "User"
ADD COLUMN "snapshotHour" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "snapshotTimezone" TEXT NOT NULL DEFAULT 'Asia/Singapore';
