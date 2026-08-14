-- CreateIndex
CREATE INDEX "Book_title_idx" ON "Book"("title");

-- CreateIndex
CREATE INDEX "Book_isAdult_category_idx" ON "Book"("isAdult", "category");

-- CreateIndex
CREATE INDEX "Book_publicationStatus_idx" ON "Book"("publicationStatus");

-- CreateIndex
CREATE INDEX "UserBook_userId_updatedAt_idx" ON "UserBook"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "UserBook_userId_status_idx" ON "UserBook"("userId", "status");

-- CreateIndex
CREATE INDEX "UserBook_bookId_idx" ON "UserBook"("bookId");
