-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'service';

-- CreateTable
CREATE TABLE "IngestSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestedTransaction" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "reference" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "transactionId" TEXT,
    "amount" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "matchState" TEXT NOT NULL DEFAULT 'unmatched',
    "needsMapping" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterpartyRecord" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "valueDate" TIMESTAMP(3) NOT NULL,
    "rawRow" JSONB NOT NULL,
    "matchState" TEXT NOT NULL DEFAULT 'unmatched',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterpartyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestFile" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "sourceAId" TEXT NOT NULL,
    "sourceBId" TEXT NOT NULL,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "summary" JSONB NOT NULL,
    "exportHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "counterpartyRecordId" TEXT,
    "outcome" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "groupId" TEXT,
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "serviceUserId" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestSource_name_key" ON "IngestSource"("name");

-- CreateIndex
CREATE INDEX "IngestedTransaction_reference_idx" ON "IngestedTransaction"("reference");

-- CreateIndex
CREATE INDEX "IngestedTransaction_matchState_idx" ON "IngestedTransaction"("matchState");

-- CreateIndex
CREATE INDEX "IngestedTransaction_amount_occurredAt_idx" ON "IngestedTransaction"("amount", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestedTransaction_sourceId_externalId_key" ON "IngestedTransaction"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "CounterpartyRecord_reference_idx" ON "CounterpartyRecord"("reference");

-- CreateIndex
CREATE INDEX "CounterpartyRecord_amount_valueDate_idx" ON "CounterpartyRecord"("amount", "valueDate");

-- CreateIndex
CREATE INDEX "CounterpartyRecord_matchState_idx" ON "CounterpartyRecord"("matchState");

-- CreateIndex
CREATE UNIQUE INDEX "IngestFile_contentHash_key" ON "IngestFile"("contentHash");

-- CreateIndex
CREATE INDEX "Match_runId_idx" ON "Match"("runId");

-- CreateIndex
CREATE INDEX "Match_groupId_idx" ON "Match"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey"("hash");

-- CreateIndex
CREATE INDEX "ApiKey_serviceUserId_idx" ON "ApiKey"("serviceUserId");

-- AddForeignKey
ALTER TABLE "IngestedTransaction" ADD CONSTRAINT "IngestedTransaction_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterpartyRecord" ADD CONSTRAINT "CounterpartyRecord_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "IngestFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterpartyRecord" ADD CONSTRAINT "CounterpartyRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestFile" ADD CONSTRAINT "IngestFile_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
