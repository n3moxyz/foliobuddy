CREATE TYPE "IbkrSyncRequestStatus" AS ENUM ('queued', 'running', 'verified', 'failed', 'blocked', 'expired');

ALTER TABLE "IbkrSyncDevice" ADD COLUMN "supportsOnDemand" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "IbkrSyncRequest" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "activeDeviceId" TEXT,
    "status" "IbkrSyncRequestStatus" NOT NULL DEFAULT 'queued',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IbkrSyncRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IbkrSyncAttempt" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "IbkrSyncAttempt_requestId_key" ON "IbkrSyncAttempt"("requestId");
CREATE UNIQUE INDEX "IbkrSyncRequest_activeDeviceId_key" ON "IbkrSyncRequest"("activeDeviceId");
CREATE INDEX "IbkrSyncRequest_deviceId_createdAt_idx" ON "IbkrSyncRequest"("deviceId", "createdAt");

ALTER TABLE "IbkrSyncRequest" ADD CONSTRAINT "IbkrSyncRequest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "IbkrSyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IbkrSyncAttempt" ADD CONSTRAINT "IbkrSyncAttempt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "IbkrSyncRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
