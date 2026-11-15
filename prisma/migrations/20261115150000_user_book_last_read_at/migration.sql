-- AlterTable
ALTER TABLE "UserBook" ADD COLUMN "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing rows use the last library edit as a stand-in until the reader saves again.
UPDATE "UserBook" SET "lastReadAt" = "updatedAt";
