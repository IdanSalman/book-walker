-- CreateEnum
CREATE TYPE "SourceFamily" AS ENUM ('COMIC', 'BOOK', 'METADATA');

-- AlterTable
ALTER TABLE "FetchSource" ADD COLUMN "family" "SourceFamily" NOT NULL DEFAULT 'COMIC';

-- Built-in book libraries
UPDATE "FetchSource"
SET "family" = 'BOOK'
WHERE "key" IN (
  'openlibrary',
  'internetarchive',
  'gutenberg',
  'standardebooks',
  'wikisource',
  'gallica'
);

-- Metadata catalogs (preset keys and any METADATA-kind row)
UPDATE "FetchSource"
SET "family" = 'METADATA'
WHERE "kind" = 'METADATA'
   OR "key" IN ('anilist', 'hathitrust', 'googlebooks');

-- Indexes from library_perf that were never created on this database
CREATE INDEX IF NOT EXISTS "Book_title_idx" ON "Book"("title");
CREATE INDEX IF NOT EXISTS "Book_isAdult_category_idx" ON "Book"("isAdult", "category");
CREATE INDEX IF NOT EXISTS "UserBook_userId_updatedAt_idx" ON "UserBook"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "UserBook_userId_status_idx" ON "UserBook"("userId", "status");
CREATE INDEX IF NOT EXISTS "UserBook_bookId_idx" ON "UserBook"("bookId");
