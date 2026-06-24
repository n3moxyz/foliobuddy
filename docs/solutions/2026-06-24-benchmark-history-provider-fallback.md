# Benchmark History Provider Fallback

## Symptom

Dashboard renders but browser QA records 500s from:

- `GET /api/v1/prices/historical/bitcoin?...&provider=coingecko`
- `GET /api/v1/prices/historical/ethereum?...&provider=coingecko`

This appears in local or network-restricted QA even when the sanitized database has BTC/ETH price
history.

## Cause

`priceService.getAssetHistory()` delegated directly to live providers. The scale seed populated
stored `PriceHistory`, but benchmark history reads had no fallback path when CoinGecko or Yahoo was
unavailable.

## Fix

`packages/backend/src/services/priceService.ts` now falls back to stored `PriceHistory` rows for the
matching `priceProvider + providerAssetId` when the live provider fails or returns no points.
Fallback rows are compacted to the latest point per UTC day before returning to the chart.

Regression coverage: `packages/backend/src/__tests__/priceService.test.ts`.

## Verification

Run the local scale stack with local auth bypass and open Dashboard. The final QA evidence should
show zero relevant bad API responses, and `/api/v1/prices/historical/bitcoin?...` should return
stored daily points instead of 500 when external provider history is unavailable.
