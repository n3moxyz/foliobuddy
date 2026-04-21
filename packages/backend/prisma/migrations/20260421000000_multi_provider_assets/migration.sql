-- Asset: add multi-provider columns
ALTER TABLE "Asset"
  ADD COLUMN "priceProvider"   TEXT NOT NULL DEFAULT 'coingecko',
  ADD COLUMN "providerAssetId" TEXT,
  ADD COLUMN "nativeCurrency"  TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "exchange"        TEXT,
  ADD COLUMN "factsheetUrl"    TEXT,
  ADD COLUMN "isin"            TEXT;

-- Backfill existing crypto rows: providerAssetId = coingeckoId
UPDATE "Asset"
   SET "providerAssetId" = "coingeckoId"
 WHERE "providerAssetId" IS NULL
   AND "coingeckoId"     IS NOT NULL;

-- Partial unique index (tuple is unique only when providerAssetId is set)
CREATE UNIQUE INDEX "Asset_priceProvider_providerAssetId_key"
  ON "Asset" ("priceProvider", "providerAssetId")
  WHERE "providerAssetId" IS NOT NULL;

-- PriceHistory: add native/source columns
ALTER TABLE "PriceHistory"
  ADD COLUMN "nativePrice"    DOUBLE PRECISION,
  ADD COLUMN "nativeCurrency" TEXT,
  ADD COLUMN "fxRateToUsd"    DOUBLE PRECISION,
  ADD COLUMN "source"         TEXT NOT NULL DEFAULT 'coingecko',
  ADD COLUMN "updatedBy"      TEXT;

-- Dedup any exact-timestamp duplicates before adding unique constraint.
-- CoinGecko writes at ms precision so duplicates are extremely unlikely,
-- but this keeps the migration safe against any edge case in prod.
DELETE FROM "PriceHistory" a
 USING "PriceHistory" b
 WHERE a."id" < b."id"
   AND a."assetId" = b."assetId"
   AND a."timestamp" = b."timestamp";

CREATE UNIQUE INDEX "PriceHistory_assetId_timestamp_key"
  ON "PriceHistory" ("assetId", "timestamp");
