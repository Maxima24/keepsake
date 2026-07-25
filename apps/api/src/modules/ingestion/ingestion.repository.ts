import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { postTransactionCore } from '../ledger/ledger.repository';
import { IngestTransactionDto } from './dto/ingest-transaction.dto';

export interface IngestOutcome {
  record: { id: string; transactionId: string | null; needsMapping: boolean };
  duplicate: boolean;
}

@Injectable()
export class IngestionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
  ) {}

  /**
   * Ingest one Source-A transaction, idempotent by (source, externalId). When all
   * account names resolve, it posts a real ledger transaction (shared core) and
   * links it; otherwise the record is kept with needsMapping=true (never dropped).
   * Everything — including the hash-chained 'ingested' audit row — is one tx.
   */
  async ingest(dto: IngestTransactionDto, actorId: string): Promise<IngestOutcome> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Resolve (or register) the ingest source.
      const source = await tx.ingestSource.upsert({
        where: { name: dto.source },
        update: {},
        create: { name: dto.source, kind: 'ledger' },
      });

      // 2. Idempotency: same (source, externalId) → return the existing record.
      const existing = await tx.ingestedTransaction.findUnique({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId: dto.externalId,
          },
        },
      });
      if (existing) {
        return {
          record: {
            id: existing.id,
            transactionId: existing.transactionId,
            needsMapping: existing.needsMapping,
          },
          duplicate: true,
        };
      }

      // 3. Resolve account names → ids.
      const names = [...new Set(dto.entries.map((e) => e.account))];
      const accounts = await tx.account.findMany({
        where: { name: { in: names } },
        select: { id: true, name: true },
      });
      const byName = new Map(accounts.map((a) => [a.name, a.id]));
      const unresolved = names.filter((n) => !byName.has(n));

      // Transaction magnitude for matching (balanced → debit sum == credit sum).
      const amount = dto.entries
        .filter((e) => e.direction === 'debit')
        .reduce((s, e) => s + e.amount, 0);

      let transactionId: string | null = null;
      const needsMapping = unresolved.length > 0;

      if (!needsMapping) {
        const full = await postTransactionCore(tx, {
          description: dto.description ?? `Ingested ${dto.externalId}`,
          entries: dto.entries.map((e) => ({
            accountId: byName.get(e.account)!,
            direction: e.direction,
            amount: e.amount,
          })),
        });
        transactionId = full.id;
      }

      // 4. Record the Source-A mirror.
      const record = await tx.ingestedTransaction.create({
        data: {
          sourceId: source.id,
          externalId: dto.externalId,
          reference: dto.reference ?? null,
          occurredAt: new Date(dto.occurredAt),
          description: dto.description ?? null,
          transactionId,
          amount,
          direction: dto.entries[0].direction,
          needsMapping,
          metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue,
        },
      });

      // 5. Hash-chained audit row (actor = the service identity behind the key).
      await this.audit.appendInTx(tx, {
        entity: 'ingestion',
        entityId: record.id,
        action: 'ingested',
        actorId,
        snapshot: {
          externalId: dto.externalId,
          source: dto.source,
          transactionId,
          needsMapping,
          unresolvedAccounts: unresolved,
        },
      });

      return {
        record: { id: record.id, transactionId, needsMapping },
        duplicate: false,
      };
    });
  }

  /** Source-A records flagged needsMapping (unresolved account → never posted). */
  async listNeedsMapping(limit = 100) {
    const rows = await this.prisma.ingestedTransaction.findMany({
      where: { needsMapping: true },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: { source: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      source: r.source?.name ?? r.sourceId,
      externalId: r.externalId,
      reference: r.reference,
      amount: r.amount,
      occurredAt: r.occurredAt,
    }));
  }

  /** Re-fetch a record by (source, externalId) — used to answer a lost idempotency race. */
  async findByExternalId(sourceName: string, externalId: string) {
    const source = await this.prisma.ingestSource.findUnique({
      where: { name: sourceName },
    });
    if (!source) return null;
    return this.prisma.ingestedTransaction.findUnique({
      where: { sourceId_externalId: { sourceId: source.id, externalId } },
    });
  }
}
