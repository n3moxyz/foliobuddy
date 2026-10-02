CREATE TABLE "IbkrSyncDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cashPositionId" TEXT NOT NULL,
  "activeCashPositionId" TEXT,
  "name" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "keyFingerprint" TEXT NOT NULL,
  "connectorFingerprint" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "lastVerifiedAt" TIMESTAMP(3),
  "lastCapturedAt" TIMESTAMP(3),
  "lastStatus" TEXT NOT NULL DEFAULT 'authorized',
  "lastError" TEXT,
  "lastChanges" JSONB,
  CONSTRAINT "IbkrSyncDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IbkrSyncDevice_activeCashPositionId_key" ON "IbkrSyncDevice"("activeCashPositionId");
CREATE UNIQUE INDEX "IbkrSyncDevice_keyFingerprint_key" ON "IbkrSyncDevice"("keyFingerprint");
CREATE INDEX "IbkrSyncDevice_userId_cashPositionId_createdAt_idx" ON "IbkrSyncDevice"("userId", "cashPositionId", "createdAt");
ALTER TABLE "IbkrSyncDevice" ADD CONSTRAINT "IbkrSyncDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IbkrSyncDevice" ADD CONSTRAINT "IbkrSyncDevice_cashPositionId_fkey"
  FOREIGN KEY ("cashPositionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IbkrSyncDeviceNonce" (
  "deviceId" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IbkrSyncDeviceNonce_pkey" PRIMARY KEY ("deviceId", "nonce")
);
CREATE INDEX "IbkrSyncDeviceNonce_expiresAt_idx" ON "IbkrSyncDeviceNonce"("expiresAt");
ALTER TABLE "IbkrSyncDeviceNonce" ADD CONSTRAINT "IbkrSyncDeviceNonce_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "IbkrSyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IbkrSyncAttempt" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "activeCashPositionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'previewed',
  "capture" JSONB NOT NULL,
  "state" TEXT NOT NULL,
  "backup" JSONB NOT NULL,
  "checkpointHash" TEXT NOT NULL,
  "runId" TEXT,
  "readbackHash" TEXT,
  "unchanged" BOOLEAN NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "errorStage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbkrSyncAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IbkrSyncAttempt_activeCashPositionId_key" ON "IbkrSyncAttempt"("activeCashPositionId");
CREATE INDEX "IbkrSyncAttempt_deviceId_createdAt_idx" ON "IbkrSyncAttempt"("deviceId", "createdAt");
ALTER TABLE "IbkrSyncAttempt" ADD CONSTRAINT "IbkrSyncAttempt_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "IbkrSyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
