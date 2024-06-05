-- CreateTable
CREATE TABLE "Observe" (
    "userId" TEXT NOT NULL,
    "createdAtMS" BIGINT NOT NULL,
    "updatedAtMS" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cssSelector" TEXT NOT NULL,
    "currentText" TEXT NOT NULL,
    "domElementProperty" TEXT,
    "scrapeIntervalType" TEXT NOT NULL,
    "lastScrapeAtMS" BIGINT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Observe_userId_name_key" ON "Observe"("userId", "name");
