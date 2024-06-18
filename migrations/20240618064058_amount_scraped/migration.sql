-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Observe" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAtMS" BIGINT NOT NULL,
    "updatedAtMS" BIGINT NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cssSelector" TEXT NOT NULL,
    "currentText" TEXT NOT NULL,
    "domElementProperty" TEXT,
    "scrapeIntervalType" TEXT NOT NULL DEFAULT 'Hourly',
    "keepActive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastScrapeAtMS" BIGINT NOT NULL DEFAULT 0,
    "consecutiveTimeouts" INTEGER NOT NULL DEFAULT 0,
    "timeouts" INTEGER NOT NULL DEFAULT 0,
    "thumbnail" TEXT,
    "amountScraped" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Observe" ("active", "consecutiveTimeouts", "createdAtMS", "cssSelector", "currentText", "domElementProperty", "guildId", "keepActive", "lastScrapeAtMS", "name", "scrapeIntervalType", "thumbnail", "timeouts", "updatedAtMS", "url", "userId") SELECT "active", "consecutiveTimeouts", "createdAtMS", "cssSelector", "currentText", "domElementProperty", "guildId", "keepActive", "lastScrapeAtMS", "name", "scrapeIntervalType", "thumbnail", "timeouts", "updatedAtMS", "url", "userId" FROM "Observe";
DROP TABLE "Observe";
ALTER TABLE "new_Observe" RENAME TO "Observe";
CREATE UNIQUE INDEX "Observe_guildId_userId_name_key" ON "Observe"("guildId", "userId", "name");
PRAGMA foreign_key_check("Observe");
PRAGMA foreign_keys=ON;
