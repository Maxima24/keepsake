import { readFileSync } from 'node:fs';
import { computeHash } from '../src/common/crypto/audit-hash';

/**
 * Verify a plain audit-chain array (seq ascending, genesis..k) offline.
 * Used to independently verify archived rows. Run: `tsx scripts/verify-chain.ts <rows.json>`.
 */
const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/verify-chain.ts <rows.json>');
  process.exit(2);
}
interface Row {
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
const rows = JSON.parse(readFileSync(file, 'utf8')) as Row[];

let prev: string | null = null;
let valid = true;
let brokenAtSeq: string | null = null;
for (const r of rows) {
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
    prev,
  );
  if (r.prevHash !== prev || r.hash !== expected) {
    valid = false;
    brokenAtSeq = r.seq;
    break;
  }
  prev = r.hash;
}
const headHash = rows.length ? rows[rows.length - 1].hash : null;
console.log(JSON.stringify({ valid, brokenAtSeq, checked: rows.length, headHash }));
process.exit(valid ? 0 : 1);
