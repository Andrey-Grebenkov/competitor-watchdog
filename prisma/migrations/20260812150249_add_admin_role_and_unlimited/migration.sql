-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- DropForeignKey
ALTER TABLE "CheckHistory" DROP CONSTRAINT "CheckHistory_siteId_fkey";

-- DropForeignKey
ALTER TABLE "WatchedSite" DROP CONSTRAINT "WatchedSite_userId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isUnlimited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- AddForeignKey
ALTER TABLE "WatchedSite" ADD CONSTRAINT "WatchedSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckHistory" ADD CONSTRAINT "CheckHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WatchedSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
