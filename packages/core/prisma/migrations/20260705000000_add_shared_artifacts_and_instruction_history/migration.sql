-- AlterTable
ALTER TABLE "SharedChat" ADD COLUMN "instructionHistory" TEXT;

-- CreateTable
CREATE TABLE "SharedArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "instructionHistory" TEXT,
    CONSTRAINT "SharedArtifact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
