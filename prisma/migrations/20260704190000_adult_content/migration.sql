-- AlterTable
ALTER TABLE "User" ADD COLUMN "hideAdultContent" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Book" ADD COLUMN "sourceName" TEXT,
ADD COLUMN "isAdult" BOOLEAN NOT NULL DEFAULT false;
