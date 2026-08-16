-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('API', 'SCRAPER', 'METADATA');

-- CreateEnum
CREATE TYPE "SourceHealth" AS ENUM ('UNKNOWN', 'ONLINE', 'DEGRADED', 'OFFLINE');

-- CreateTable
CREATE TABLE "FetchSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL DEFAULT 'SCRAPER',
    "language" TEXT NOT NULL DEFAULT 'en',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "supportsSearch" BOOLEAN NOT NULL DEFAULT false,
    "supportsMetadata" BOOLEAN NOT NULL DEFAULT false,
    "supportsReading" BOOLEAN NOT NULL DEFAULT false,
    "isAdultSource" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "health" "SourceHealth" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "lastLatencyMs" INTEGER,
    "lastError" TEXT,
    "lastImportAt" TIMESTAMP(3),
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FetchSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FetchSource_key_key" ON "FetchSource"("key");

-- CreateIndex
CREATE INDEX "FetchSource_enabled_priority_idx" ON "FetchSource"("enabled", "priority");
