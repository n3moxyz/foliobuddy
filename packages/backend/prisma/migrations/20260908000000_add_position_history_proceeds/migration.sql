-- Sale proceeds recorded on reduce history rows. Cost basis still comes off at the
-- current average cost; this only records what the sold quantity fetched (USD).
ALTER TABLE "PositionHistory" ADD COLUMN "proceedsUsd" DOUBLE PRECISION;
