-- CreateTable
CREATE TABLE "LibraryCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBookCategory" (
    "userBookId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "UserBookCategory_pkey" PRIMARY KEY ("userBookId","categoryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCategory_userId_slug_key" ON "LibraryCategory"("userId", "slug");

-- CreateIndex
CREATE INDEX "LibraryCategory_userId_sortOrder_idx" ON "LibraryCategory"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "UserBookCategory_categoryId_idx" ON "UserBookCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "LibraryCategory" ADD CONSTRAINT "LibraryCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBookCategory" ADD CONSTRAINT "UserBookCategory_userBookId_fkey" FOREIGN KEY ("userBookId") REFERENCES "UserBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBookCategory" ADD CONSTRAINT "UserBookCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LibraryCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
