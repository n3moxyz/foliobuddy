-- Nullable by design: NULL distinguishes an unsynced legacy browser value from an explicit zero.
ALTER TABLE "User"
ADD COLUMN "perpExposureUsd" DOUBLE PRECISION;
