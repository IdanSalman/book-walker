-- AlterTable
ALTER TABLE "Book" ADD COLUMN "artist" TEXT,
ADD COLUMN "author" TEXT,
ADD COLUMN "genres" TEXT[] DEFAULT ARRAY[]::TEXT[];
