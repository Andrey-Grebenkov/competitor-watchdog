-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'free',
    "telegramChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchedSite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cssSelector" TEXT,
    "checkIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchedSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckHistory" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "screenshotUrl" TEXT NOT NULL,
    "aiSummary" TEXT,
    "isAlertTriggered" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "WatchedSite" ADD CONSTRAINT "WatchedSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckHistory" ADD CONSTRAINT "CheckHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WatchedSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
