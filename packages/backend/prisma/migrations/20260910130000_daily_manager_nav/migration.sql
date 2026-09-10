ALTER TABLE "Asset"
  ADD COLUMN "currentPriceNative" DOUBLE PRECISION,
  ADD COLUMN "priceAsOf" TIMESTAMP(3),
  ADD COLUMN "priceSource" TEXT,
  ADD COLUMN "priceCheckedAt" TIMESTAMP(3),
  ADD COLUMN "priceCheckStatus" TEXT,
  ADD COLUMN "priceFxRateToUsd" DOUBLE PRECISION;

-- Preserve statement and manager observations independently on the same day.
DROP INDEX "PriceHistory_assetId_timestamp_key";
CREATE UNIQUE INDEX "PriceHistory_assetId_timestamp_source_key"
  ON "PriceHistory"("assetId", "timestamp", "source");

-- A manual refresh's fetch time is not a valuation date. Recover only dates
-- actually present in historical manual NAV observations; never infer Yahoo's.
UPDATE "Asset" a SET
  "priceAsOf" = date_trunc('day', h."timestamp"), "priceUpdatedAt" = date_trunc('day', h."timestamp"),
  "currentPriceNative" = h."nativePrice", "priceSource" = 'manual',
  "priceFxRateToUsd" = h."fxRateToUsd"
FROM (
  SELECT DISTINCT ON ("assetId") * FROM "PriceHistory"
  WHERE "source" = 'manual' AND "nativePrice" > 0 AND "nativePrice" < 'Infinity'::float8
    AND "timestamp" <= NOW()
  ORDER BY "assetId", "timestamp" DESC
) h
WHERE a.id = h."assetId" AND a.category = 'UNIT_TRUST'
  AND a."priceProvider" = 'manual' AND a."nativeCurrency" = h."nativeCurrency";
