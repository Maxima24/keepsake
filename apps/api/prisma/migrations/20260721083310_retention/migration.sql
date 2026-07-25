-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "auditRetentionDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditArchive" (
    "id" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "snapshot" JSONB NOT NULL,
    "prevHash" TEXT,
    "hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditArchive_seq_key" ON "AuditArchive"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "AuditArchive_hash_key" ON "AuditArchive"("hash");
