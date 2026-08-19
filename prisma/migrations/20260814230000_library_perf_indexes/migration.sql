-- CreateIndex
CREATE INDEX IF NOT EXISTS "Book_title_idx" ON "Book"("title");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Book_isAdult_category_idx" ON "Book"("isAdult", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Book_publicationStatus_idx" ON "Book"("publicationStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserBook_userId_updatedAt_idx" ON "UserBook"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserBook_userId_status_idx" ON "UserBook"("userId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserBook_bookId_idx" ON "UserBook"("bookId");
