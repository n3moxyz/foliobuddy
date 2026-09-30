ALTER TABLE "Position" ADD COLUMN "ibkrContractId" INTEGER,
  ADD COLUMN "ibkrSyncedAt" TIMESTAMP(3), ADD COLUMN "ibkrCash" JSONB;
CREATE UNIQUE INDEX "Position_userId_ibkrContractId_key" ON "Position"("userId", "ibkrContractId");
CREATE TABLE "IbkrSyncRun" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "captureHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "source" JSONB NOT NULL, "before" JSONB NOT NULL,
  "after" JSONB NOT NULL, "restoredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IbkrSyncRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbkrSyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IbkrSyncRun_userId_captureHash_key" ON "IbkrSyncRun"("userId", "captureHash");
CREATE INDEX "IbkrSyncRun_userId_createdAt_idx" ON "IbkrSyncRun"("userId", "createdAt");
