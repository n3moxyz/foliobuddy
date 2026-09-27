-- Posts collected from the private X source roster (X_NEWS_SOURCES) for the
-- News tab. Holdings are matched at read time, so rows carry no user data.
-- CreateTable
CREATE TABLE "XPost" (
    "id" TEXT NOT NULL,
    "authorHandle" TEXT NOT NULL,
    "authorKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "quotedPostId" TEXT,
    "quotedHandle" TEXT,
    "quotedText" TEXT,
    "hasExternalLink" BOOLEAN NOT NULL DEFAULT false,
    "cashtags" TEXT[],
    "lang" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XPost_postedAt_idx" ON "XPost"("postedAt");

-- CreateIndex
CREATE INDEX "XPost_authorKey_postedAt_idx" ON "XPost"("authorKey", "postedAt");
