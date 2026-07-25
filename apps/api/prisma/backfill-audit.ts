import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { computeHash } from '../src/common/crypto/audit-hash';

/**
 * One-off backfill: walk existing AuditLog rows in seq order and compute their
 * prevHash/hash so the chain is valid from genesis. Idempotent (recomputes).
 * Uses the SAME canonicalization the app uses.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set.');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main(): Promise<void> {
  const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
  let prevHash: string | null = null;
  let updated = 0;
  for (const r of rows) {
    const hash = computeHash(
      {
        seq: r.seq.toString(),
        entity: r.entity,
        entityId: r.entityId,
        action: r.action,
        actorId: r.actorId,
        createdAt: r.createdAt.toISOString(),
        snapshot: r.snapshot,
      },
      prevHash,
    );
    if (r.prevHash !== prevHash || r.hash !== hash) {
      await prisma.auditLog.update({
        where: { id: r.id },
        data: { prevHash, hash },
      });
      updated++;
    }
    prevHash = hash;
  }
  console.log(
    `Backfilled ${updated} of ${rows.length} audit rows into a valid chain.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
