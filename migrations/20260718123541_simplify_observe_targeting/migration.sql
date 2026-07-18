/*
  Warnings:

  - You are about to drop the column `currentText` on the `Observe` table. All the data in the column will be lost.
  - You are about to drop the column `domElementProperty` on the `Observe` table. All the data in the column will be lost.
  - Added the required column `watchText` to the `Observe` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Observe" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAtMS" BIGINT NOT NULL,
    "updatedAtMS" BIGINT NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cssSelector" TEXT,
    "watchText" TEXT NOT NULL,
    "scrapeIntervalType" TEXT NOT NULL DEFAULT 'Hourly',
    "keepActive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastScrapeAtMS" BIGINT NOT NULL DEFAULT 0,
    "consecutiveTimeouts" INTEGER NOT NULL DEFAULT 0,
    "timeouts" INTEGER NOT NULL DEFAULT 0,
    "thumbnail" TEXT,
    "amountScraped" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Observe" ("active", "amountScraped", "consecutiveTimeouts", "createdAtMS", "cssSelector", "guildId", "keepActive", "lastScrapeAtMS", "name", "scrapeIntervalType", "thumbnail", "timeouts", "updatedAtMS", "url", "userId") SELECT "active", "amountScraped", "consecutiveTimeouts", "createdAtMS", "cssSelector", "guildId", "keepActive", "lastScrapeAtMS", "name", "scrapeIntervalType", "thumbnail", "timeouts", "updatedAtMS", "url", "userId" FROM "Observe";
DROP TABLE "Observe";
ALTER TABLE "new_Observe" RENAME TO "Observe";
CREATE UNIQUE INDEX "Observe_guildId_userId_name_key" ON "Observe"("guildId", "userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
