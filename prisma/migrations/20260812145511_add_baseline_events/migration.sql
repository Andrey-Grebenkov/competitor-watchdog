-- CreateTable
CREATE TABLE "BaselineEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT,
    "siteUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaselineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BaselineEvent_userId_createdAt_idx" ON "BaselineEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "BaselineEvent" ADD CONSTRAINT "BaselineEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
