import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { computeHash, stableStringify } from '../src/common/crypto/audit-hash';

/**
 * Offline verifier for a Keepsake export document. No DB access — it re-checks
 * the audit hash chain and the document's exportHash using only the shared
 * canonicalization. Run: `tsx scripts/verify-export.ts <export.json>`.
 */
const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/verify-export.ts <export.json>');
  process.exit(2);
}

interface AuditRow {
  seq: string;
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  createdAt: string;
  snapshot: unknown;
  prevHash: string | null;
  hash: string | null;
}
const doc = JSON.parse(readFileSync(file, 'utf8')) as {
  exportHash: string;
  chainHead: string | null;
  audit: AuditRow[];
  [k: string]: unknown;
};

// 1. Document integrity.
const { exportHash, ...rest } = doc;
const recomputed = createHash('sha256')
  .update(stableStringify(rest))
  .digest('hex');
const exportHashOk = recomputed === exportHash;

// 2. Audit chain integrity (from genesis).
let prevHash: string | null = null;
let chainOk = true;
let brokenAtSeq: string | null = null;
for (const r of doc.audit) {
  const expected = computeHash(
    {
      seq: r.seq,
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      actorId: r.actorId,
      createdAt: r.createdAt,
      snapshot: r.snapshot,
    },
    prevHash,
  );
  if (r.prevHash !== prevHash || r.hash !== expected) {
    chainOk = false;
    brokenAtSeq = r.seq;
    break;
  }
  prevHash = r.hash;
}

const headOk =
  doc.chainHead ===
  (doc.audit.length ? doc.audit[doc.audit.length - 1].hash : null);
const valid = exportHashOk && chainOk && headOk;

console.log(
  JSON.stringify(
    { valid, exportHashOk, chainOk, headOk, brokenAtSeq, checked: doc.audit.length },
    null,
    2,
  ),
);
process.exit(valid ? 0 : 1);
