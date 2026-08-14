-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('ONGOING', 'COMPLETED', 'HIATUS', 'CANCELLED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Book" ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "externalId" TEXT,
ADD COLUMN "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Book_externalId_idx" ON "Book"("externalId");

-- CreateIndex
CREATE INDEX "Book_publicationStatus_idx" ON "Book"("publicationStatus");
