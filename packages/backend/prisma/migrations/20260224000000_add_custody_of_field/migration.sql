-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "custodyOf" TEXT;

-- CreateIndex
CREATE INDEX "Position_custodyOf_idx" ON "Position"("custodyOf");
