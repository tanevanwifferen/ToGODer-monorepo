-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ios',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledWakeup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "triggerAt" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "fired" BOOLEAN NOT NULL DEFAULT false,
    "firedAt" DATETIME,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledWakeup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE INDEX "ScheduledWakeup_userId_idx" ON "ScheduledWakeup"("userId");

-- CreateIndex
CREATE INDEX "ScheduledWakeup_triggerAt_idx" ON "ScheduledWakeup"("triggerAt");

-- CreateIndex
CREATE INDEX "ScheduledWakeup_fired_idx" ON "ScheduledWakeup"("fired");
