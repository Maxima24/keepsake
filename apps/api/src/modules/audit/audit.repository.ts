import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { computeHash } from '../../common/crypto/audit-hash';

export interface AuditAppendInput {
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  snapshot: unknown;
}

export interface VerifyResult {
  valid: boolean;
  brokenAtSeq: string | null;
  checked: number;
}

// One row's fields needed to recompute/verify its hash.
interface ChainRow {
  seq: bigint;
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  createdAt: Date;
  snapshot: unknown;
  prevHash: string | null;
  hash: string | null;
}

type TxClient = Prisma.TransactionClient;

function isCheckpoint(r: ChainRow): boolean {
  return r.entity === 'audit' && r.action === 'checkpoint';
}

/** Walk rows in seq order; a checkpoint row is an anchor (its hash is trusted, not recomputed). */
function verifyRows(rows: ChainRow[]): VerifyResult {
  let prevHash: string | null = null;
  let checked = 0;
  for (const r of rows) {
    if (isCheckpoint(r)) {
      prevHash = r.hash;
      checked++;
      continue;
    }
    const expected = computeHash(
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
    if (r.prevHash !== prevHash || r.hash !== expected) {
      return { valid: false, brokenAtSeq: r.seq.toString(), checked };
    }
    checked++;
    prevHash = r.hash;
  }
  return { valid: true, brokenAtSeq: null, checked };
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Append one row to the hash chain inside an existing transaction (serialized). */
  async appendInTx(tx: TxClient, input: AuditAppendInput) {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(4242)');

    const head = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' } });
    const seq = head ? head.seq + 1n : 1n;
    const prevHash = head?.hash ?? null;
    const createdAt = new Date();

    const hash = computeHash(
      {
        seq: seq.toString(),
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        actorId: input.actorId,
        createdAt: createdAt.toISOString(),
        snapshot: input.snapshot,
      },
      prevHash,
    );

    return tx.auditLog.create({
      data: {
        seq,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        actorId: input.actorId,
        snapshot: input.snapshot as Prisma.InputJsonValue,
        prevHash,
        hash,
        createdAt,
      },
    });
  }

  /** Append outside any existing transaction (opens its own). */
  append(input: AuditAppendInput) {
    return this.prisma.$transaction((tx) => this.appendInTx(tx, input));
  }

  findAll() {
    return this.prisma.auditLog.findMany({ orderBy: { seq: 'desc' } });
  }

  /** The chain prefix (seq ascending) up to and including timestamp `at`. */
  findUpTo(at: Date) {
    return this.prisma.auditLog.findMany({
      where: { createdAt: { lte: at } },
      orderBy: { seq: 'asc' },
    });
  }

  /** Verify the live chain (checkpoint-aware). */
  async verifyChain(): Promise<VerifyResult> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
    return verifyRows(rows);
  }

  findArchive() {
    return this.prisma.auditArchive.findMany({ orderBy: { seq: 'asc' } });
  }

  /** Verify the archived prefix independently, and return its head hash. */
  async verifyArchive(): Promise<VerifyResult & { headHash: string | null }> {
    const rows = await this.prisma.auditArchive.findMany({
      orderBy: { seq: 'asc' },
    });
    const result = verifyRows(rows);
    const headHash = rows.length ? rows[rows.length - 1].hash : null;
    return { ...result, headHash };
  }

  /**
   * Archive every live audit row created at/before `cutoff`: copy to AuditArchive
   * FIRST, prune from the live chain, then write a checkpoint whose hash is the
   * last archived hash so the oldest remaining row still links to it. Verifies the
   * resulting live chain in-transaction and refuses (rolls back) if it would break.
   */
  async archiveOlderThan(
    cutoff: Date,
    actorId: string | null,
  ): Promise<{ archived: number; checkpointHash: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(4242)');

      const toArchive = await tx.auditLog.findMany({
        where: { createdAt: { lte: cutoff } },
        orderBy: { seq: 'asc' },
      });
      if (toArchive.length === 0) {
        return { archived: 0, checkpointHash: null };
      }
      const last = toArchive[toArchive.length - 1];
      const checkpointHash = last.hash;

      // 1. Copy to the archive BEFORE any pruning.
      await tx.auditArchive.createMany({
        data: toArchive.map((r) => ({
          id: r.id,
          seq: r.seq,
          entity: r.entity,
          entityId: r.entityId,
          action: r.action,
          actorId: r.actorId,
          snapshot: r.snapshot as Prisma.InputJsonValue,
          prevHash: r.prevHash,
          hash: r.hash,
          createdAt: r.createdAt,
        })),
      });

      // 2. Prune from the live chain.
      await tx.auditLog.deleteMany({
        where: { seq: { in: toArchive.map((r) => r.seq) } },
      });

      // 3. Checkpoint: anchors the live chain to the archived prefix (reuses the
      //    vacated max seq; its hash IS the last archived hash).
      await tx.auditLog.create({
        data: {
          seq: last.seq,
          entity: 'audit',
          entityId: 'checkpoint',
          action: 'checkpoint',
          actorId,
          snapshot: {
            archivedThrough: last.seq.toString(),
            archivedCount: toArchive.length,
            lastArchivedHash: checkpointHash,
          } as Prisma.InputJsonValue,
          prevHash: null,
          hash: checkpointHash,
          createdAt: last.createdAt,
        },
      });

      // 4. Refuse (rollback) if archival broke verifiability.
      const liveRows = await tx.auditLog.findMany({ orderBy: { seq: 'asc' } });
      const result = verifyRows(liveRows);
      if (!result.valid) {
        throw new Error(
          `Archival would break verifiability (seq ${result.brokenAtSeq}); refusing.`,
        );
      }

      return { archived: toArchive.length, checkpointHash };
    });
  }
}
