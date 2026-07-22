-- CreateTable
CREATE TABLE "SharedFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "publishedToPayload" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SharedFolder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SharedFolderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folderId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SharedFolderItem_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "SharedFolder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SharedFolderItem_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "SharedArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT,
    "propsJson" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SharedArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "instructionHistory" TEXT,
    "artifactSignature" TEXT,
    "publishedToPayload" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SharedArtifact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SharedArtifact" ("content", "createdAt", "description", "id", "instructionHistory", "ownerId", "title", "views", "visibility") SELECT "content", "createdAt", "description", "id", "instructionHistory", "ownerId", "title", "views", "visibility" FROM "SharedArtifact";
DROP TABLE "SharedArtifact";
ALTER TABLE "new_SharedArtifact" RENAME TO "SharedArtifact";
CREATE TABLE "new_SharedChat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messages" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "instructionHistory" TEXT,
    "publishedToPayload" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SharedChat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SharedChat" ("createdAt", "description", "id", "instructionHistory", "messages", "ownerId", "title", "views", "visibility") SELECT "createdAt", "description", "id", "instructionHistory", "messages", "ownerId", "title", "views", "visibility" FROM "SharedChat";
DROP TABLE "SharedChat";
ALTER TABLE "new_SharedChat" RENAME TO "SharedChat";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "password", "verificationToken", "verified") SELECT "createdAt", "email", "id", "password", "verificationToken", "verified" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SharedFolderItem_folderId_idx" ON "SharedFolderItem"("folderId");

-- CreateIndex
CREATE INDEX "SharedFolderItem_artifactId_idx" ON "SharedFolderItem"("artifactId");

-- CreateIndex
CREATE INDEX "Event_eventType_idx" ON "Event"("eventType");

-- CreateIndex
CREATE INDEX "Event_timestamp_idx" ON "Event"("timestamp");

-- CreateIndex
CREATE INDEX "Event_userId_idx" ON "Event"("userId");
