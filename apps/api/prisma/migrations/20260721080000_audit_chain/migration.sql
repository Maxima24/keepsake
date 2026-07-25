-- Add hash-chain columns to AuditLog.
-- seq is BIGSERIAL: existing rows get sequential values (heap ~ insertion order).
-- prevHash/hash/actorId are nullable so the column adds cleanly to existing rows;
-- a one-off backfill then populates prevHash/hash for the legacy rows.

ALTER TABLE "AuditLog"
  ADD COLUMN "seq" BIGSERIAL NOT NULL,
  ADD COLUMN "actorId" TEXT,
  ADD COLUMN "prevHash" TEXT,
  ADD COLUMN "hash" TEXT;

CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
