-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");
