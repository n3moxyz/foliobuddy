-- Link history rows created by one user action, such as an add funded from a cash pile.
ALTER TABLE "PositionHistory" ADD COLUMN "operationId" TEXT;

CREATE INDEX "PositionHistory_operationId_idx" ON "PositionHistory"("operationId");
