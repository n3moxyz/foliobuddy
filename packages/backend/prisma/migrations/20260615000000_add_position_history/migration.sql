-- CreateTable
CREATE TABLE "PositionHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "costBasisUsd" DOUBLE PRECISION NOT NULL,
    "previousQuantity" DOUBLE PRECISION NOT NULL,
    "previousAvgCostUsd" DOUBLE PRECISION NOT NULL,
    "previousTotalCostUsd" DOUBLE PRECISION NOT NULL,
    "nextQuantity" DOUBLE PRECISION NOT NULL,
    "nextAvgCostUsd" DOUBLE PRECISION NOT NULL,
    "nextTotalCostUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PositionHistory_userId_idx" ON "PositionHistory"("userId");

-- CreateIndex
CREATE INDEX "PositionHistory_positionId_createdAt_idx" ON "PositionHistory"("positionId", "createdAt");

-- CreateIndex
CREATE INDEX "PositionHistory_assetId_idx" ON "PositionHistory"("assetId");

-- AddForeignKey
ALTER TABLE "PositionHistory" ADD CONSTRAINT "PositionHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionHistory" ADD CONSTRAINT "PositionHistory_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionHistory" ADD CONSTRAINT "PositionHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
