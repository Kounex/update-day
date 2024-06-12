/*
  Warnings:

  - You are about to drop the column `timeoutLimit` on the `Settings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "createdAtMS" BIGINT NOT NULL,
    "updatedAtMS" BIGINT NOT NULL DEFAULT 0,
    "userObserveLimit" INTEGER NOT NULL DEFAULT 10,
    "guildObserveLimit" INTEGER NOT NULL DEFAULT 100,
    "consecutiveTimeoutsLimit" INTEGER NOT NULL DEFAULT 3,
    "timeout" INTEGER NOT NULL DEFAULT 15,
    "notifyOnFirstTimeout" BOOLEAN NOT NULL DEFAULT false,
    "timeoutsTillNotify" INTEGER NOT NULL DEFAULT 10
);
INSERT INTO "new_Settings" ("createdAtMS", "guildId", "guildObserveLimit", "notifyOnFirstTimeout", "timeout", "updatedAtMS", "userObserveLimit") SELECT "createdAtMS", "guildId", "guildObserveLimit", "notifyOnFirstTimeout", "timeout", "updatedAtMS", "userObserveLimit" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_key_check("Settings");
PRAGMA foreign_keys=ON;
