CREATE TABLE "IbkrConnectorBinding" (
  "connectorFingerprint" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IbkrConnectorBinding_pkey" PRIMARY KEY ("connectorFingerprint")
);
CREATE INDEX "IbkrConnectorBinding_userId_idx" ON "IbkrConnectorBinding"("userId");

-- Preserve existing approved worker grants. Conflicting ownership is recorded
-- as NULL and fails closed; never pick one of several prior owners silently.
INSERT INTO "IbkrConnectorBinding" ("connectorFingerprint", "userId", "createdAt")
SELECT "connectorFingerprint",
       CASE WHEN COUNT(DISTINCT "userId") = 1 THEN MIN("userId") ELSE NULL END,
       MIN("createdAt")
FROM "IbkrSyncDevice"
GROUP BY "connectorFingerprint";

CREATE TABLE "IbkrHelperPermit" (
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cashPositionId" TEXT NOT NULL,
  "connectorFingerprint" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "jobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "IbkrHelperPermit_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "IbkrHelperPermit_userId_createdAt_idx" ON "IbkrHelperPermit"("userId", "createdAt");
CREATE INDEX "IbkrHelperPermit_expiresAt_idx" ON "IbkrHelperPermit"("expiresAt");
