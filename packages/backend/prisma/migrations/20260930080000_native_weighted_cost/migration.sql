-- Additive only. Never infer native purchase amounts from historical USD costs.
ALTER TABLE "Position" ADD COLUMN "avgCostNative" DOUBLE PRECISION,
                       ADD COLUMN "costCurrency" TEXT;
ALTER TABLE "Position" ADD CONSTRAINT "Position_native_cost_pair_check"
  CHECK (("avgCostNative" IS NULL) = ("costCurrency" IS NULL)),
  ADD CONSTRAINT "Position_native_cost_finite_check"
  CHECK ("avgCostNative" IS NULL OR ("avgCostNative" >= 0 AND "avgCostNative" < 'Infinity'::DOUBLE PRECISION));
ALTER TABLE "PositionHistory" ADD COLUMN "costCurrency" TEXT,
                              ADD COLUMN "costBasisNative" DOUBLE PRECISION,
                              ADD COLUMN "previousAvgCostNative" DOUBLE PRECISION,
                              ADD COLUMN "nextAvgCostNative" DOUBLE PRECISION,
                              ADD COLUMN "proceedsNative" DOUBLE PRECISION,
                              ADD COLUMN "fxRateToUsd" DOUBLE PRECISION,
                              ADD COLUMN "executionPriceNative" DOUBLE PRECISION,
                              ADD COLUMN "feesNative" DOUBLE PRECISION,
                              ADD COLUMN "brokerOrderId" TEXT;
