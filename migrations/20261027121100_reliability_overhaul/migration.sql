-- Observe gets a numeric primary key (buttons and the scrape history refer
-- to an Observe by it). Existing rows are copied over and get their ids from
-- AUTOINCREMENT, so nothing is lost; the new columns start at their defaults,
-- which keeps every existing Observe on the old "Disappears" behavior.
-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "notifyChannelId" TEXT;

-- CreateTable
CREATE TABLE "ScrapeLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "observeId" INTEGER NOT NULL,
    "atMS" BIGINT NOT NULL,
    "outcome" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "durationMS" INTEGER NOT NULL,
    "detail" TEXT,
    CONSTRAINT "ScrapeLog_observeId_fkey" FOREIGN KEY ("observeId") REFERENCES "Observe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Observe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT,
    "createdAtMS" BIGINT NOT NULL,
    "updatedAtMS" BIGINT NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cssSelector" TEXT,
    "watchText" TEXT NOT NULL DEFAULT '',
    "watchMode" TEXT NOT NULL DEFAULT 'Disappears',
    "notifyMode" TEXT NOT NULL DEFAULT 'DM',
    "scrapeIntervalType" TEXT NOT NULL DEFAULT 'Hourly',
    "keepActive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastScrapeAtMS" BIGINT NOT NULL DEFAULT 0,
    "nextScrapeAtMS" BIGINT NOT NULL DEFAULT 0,
    "lastState" TEXT,
    "lastText" TEXT,
    "lastResult" TEXT,
    "lastError" TEXT,
    "triggeredAtMS" BIGINT NOT NULL DEFAULT 0,
    "consecutiveTimeouts" INTEGER NOT NULL DEFAULT 0,
    "timeouts" INTEGER NOT NULL DEFAULT 0,
    "thumbnail" TEXT,
    "amountScraped" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Observe" ("active", "amountScraped", "consecutiveTimeouts", "createdAtMS", "cssSelector", "guildId", "keepActive", "lastScrapeAtMS", "name", "scrapeIntervalType", "thumbnail", "timeouts", "updatedAtMS", "url", "userId", "watchText") SELECT "active", "amountScraped", "consecutiveTimeouts", "createdAtMS", "cssSelector", "guildId", "keepActive", "lastScrapeAtMS", "name", "scrapeIntervalType", "thumbnail", "timeouts", "updatedAtMS", "url", "userId", "watchText" FROM "Observe";
DROP TABLE "Observe";
ALTER TABLE "new_Observe" RENAME TO "Observe";
CREATE UNIQUE INDEX "Observe_guildId_userId_name_key" ON "Observe"("guildId", "userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ScrapeLog_observeId_atMS_idx" ON "ScrapeLog"("observeId", "atMS");
