/*
  Warnings:

  - You are about to drop the column `observePerGuild` on the `Settings` table. All the data in the column will be lost.
  - You are about to drop the column `observePerUser` on the `Settings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "createdAtMS" BIGINT NOT NULL,
    "updatedAtMS" BIGINT NOT NULL DEFAULT 0,
    "userObserveLimit" INTEGER NOT NULL DEFAULT 5,
    "guildObserveLimit" INTEGER NOT NULL DEFAULT 50
);
INSERT INTO "new_Settings" ("createdAtMS", "guildId", "updatedAtMS") SELECT "createdAtMS", "guildId", "updatedAtMS" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_key_check("Settings");
PRAGMA foreign_keys=ON;
