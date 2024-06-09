-- CreateTable
CREATE TABLE "Setting" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "createdAtMS" BIGINT NOT NULL,
    "updatedAtMS" BIGINT NOT NULL DEFAULT 0,
    "observePerUser" INTEGER NOT NULL DEFAULT 5,
    "observePerGuild" INTEGER NOT NULL DEFAULT 50
);
