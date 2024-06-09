/*
  Warnings:

  - Added the required column `guildId` to the `Observe` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "createdAtMS" BIGINT NOT NULL,
    "updatedAtMS" BIGINT NOT NULL DEFAULT 0,
    "userObserveLimit" INTEGER NOT NULL DEFAULT 10,
    "guildObserveLimit" INTEGER NOT NULL DEFAULT 100
);
INSERT INTO "new_Settings" ("createdAtMS", "guildId", "guildObserveLimit", "updatedAtMS", "userObserveLimit") SELECT "createdAtMS", "guildId", "guildObserveLimit", "updatedAtMS", "userObserveLimit" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
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
    "lastScrapeAtMS" BIGINT NOT NULL DEFAULT 0
);
INSERT INTO "new_Observe" ("active", "createdAtMS", "cssSelector", "currentText", "domElementProperty", "keepActive", "lastScrapeAtMS", "name", "scrapeIntervalType", "updatedAtMS", "url", "userId") SELECT "active", "createdAtMS", "cssSelector", "currentText", "domElementProperty", "keepActive", "lastScrapeAtMS", "name", "scrapeIntervalType", "updatedAtMS", "url", "userId" FROM "Observe";
DROP TABLE "Observe";
ALTER TABLE "new_Observe" RENAME TO "Observe";
CREATE UNIQUE INDEX "Observe_guildId_userId_name_key" ON "Observe"("guildId", "userId", "name");
PRAGMA foreign_key_check("Settings");
PRAGMA foreign_key_check("Observe");
PRAGMA foreign_keys=ON;
