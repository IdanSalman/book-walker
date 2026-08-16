-- AlterTable
ALTER TABLE "UserBook" ADD COLUMN "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing rows keep their original library membership time.
UPDATE "UserBook" SET "addedAt" = "createdAt";

-- CreateIndex
CREATE INDEX "UserBook_userId_addedAt_idx" ON "UserBook"("userId", "addedAt");
