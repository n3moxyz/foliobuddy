-- Existing attempts intentionally get no reconstructed exact evidence. Any
-- unfinished old attempt still requires owner review before further writes.
ALTER TABLE "IbkrSyncAttempt" ADD COLUMN "captureText" TEXT;
ALTER TABLE "IbkrSyncAttempt" ADD COLUMN "backupText" TEXT;
