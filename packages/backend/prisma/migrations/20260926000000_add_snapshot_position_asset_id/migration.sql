-- Asset id on snapshot rows: tickers repeat across asset classes, so labels
-- resolved by symbol alone were indeterminate. Nullable with no backfill; older
-- rows keep resolving by symbol. No foreign key, so history survives asset deletes.
ALTER TABLE "SnapshotPosition" ADD COLUMN "assetId" TEXT;
