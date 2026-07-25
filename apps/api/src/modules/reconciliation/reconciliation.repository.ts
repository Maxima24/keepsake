import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { MatchResult, ReconcileSummary } from './matching';

function stateForOutcome(outcome: string): string {
  switch (outcome) {
    case 'matched':
      return 'matched';
    case 'amount_mismatch':
      return 'amount_mismatch';
    case 'duplicate':
      return 'duplicate';
    default:
      return 'unmatched';
  }
}

@Injectable()
export class ReconciliationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
  ) {}

  async resolveSource(idOrName: string) {
    const byId = await this.prisma.ingestSource.findUnique({
      where: { id: idOrName },
    });
    if (byId) return byId;
    return this.prisma.ingestSource.findUnique({ where: { name: idOrName } });
  }

  gatherA(sourceId: string, from: Date, to: Date) {
    return this.prisma.ingestedTransaction.findMany({
      where: { sourceId, occurredAt: { gte: from, lte: to } },
      orderBy: { occurredAt: 'asc' },
    });
  }

  gatherB(sourceId: string, from: Date, to: Date) {
    return this.prisma.counterpartyRecord.findMany({
      where: { sourceId, valueDate: { gte: from, lte: to } },
      orderBy: { valueDate: 'asc' },
    });
  }

  getRun(id: string) {
    return this.prisma.reconciliationRun.findUnique({
      where: { id },
      include: { matches: true },
    });
  }

  /** Most-recent runs with source names resolved (for the history list). */
  async listRuns(limit = 50) {
    const runs = await this.prisma.reconciliationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const ids = [...new Set(runs.flatMap((r) => [r.sourceAId, r.sourceBId]))];
    const sources = ids.length
      ? await this.prisma.ingestSource.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(sources.map((s) => [s.id, s.name]));
    return runs.map((r) => ({
      id: r.id,
      sourceAName: nameById.get(r.sourceAId) ?? r.sourceAId,
      sourceBName: nameById.get(r.sourceBId) ?? r.sourceBId,
      windowFrom: r.windowFrom,
      windowTo: r.windowTo,
      reconciled: r.reconciled,
      summary: r.summary,
      createdAt: r.createdAt,
    }));
  }

  getMatch(id: string) {
    return this.prisma.match.findUnique({ where: { id } });
  }

  /** Persist a run + its matches, refresh matchState on every windowed record, stamp
   * the offline-verifiable exportHash, and append a 'reconciliation_run' audit row. */
  async persistRun(input: {
    sourceAId: string;
    sourceBId: string;
    from: Date;
    to: Date;
    summary: ReconcileSummary & { l2Unposted: number };
    exportHash: string;
    results: MatchResult[];
    actorId: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.reconciliationRun.create({
        data: {
          sourceAId: input.sourceAId,
          sourceBId: input.sourceBId,
          windowFrom: input.from,
          windowTo: input.to,
          reconciled: input.summary.reconciled,
          summary: input.summary as unknown as Prisma.InputJsonValue,
          exportHash: input.exportHash,
        },
      });

      if (input.results.length) {
        await tx.match.createMany({
          data: input.results.map((r) => ({
            runId: run.id,
            sourceRecordId: r.sourceRecordId,
            counterpartyRecordId: r.counterpartyRecordId,
            outcome: r.outcome,
            method: r.method,
            confidence: r.confidence,
            groupId: r.groupId ? `${run.id}:${r.groupId}` : null,
          })),
        });
      }

      // Refresh matchState on both sides (re-runs overwrite prior state → breaks self-heal).
      for (const r of input.results) {
        const state = stateForOutcome(r.outcome);
        if (r.sourceRecordId) {
          await tx.ingestedTransaction.update({
            where: { id: r.sourceRecordId },
            data: { matchState: state },
          });
        }
        if (r.counterpartyRecordId) {
          await tx.counterpartyRecord.update({
            where: { id: r.counterpartyRecordId },
            data: { matchState: state },
          });
        }
      }

      await this.audit.appendInTx(tx, {
        entity: 'reconciliation',
        entityId: run.id,
        action: 'reconciliation_run',
        actorId: input.actorId,
        snapshot: {
          sourceAId: input.sourceAId,
          sourceBId: input.sourceBId,
          summary: input.summary,
          exportHash: input.exportHash,
        },
      });

      return run;
    });
  }

  async confirmMatch(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.update({
        where: { id },
        data: { confirmedBy: actorId },
      });
      await this.audit.appendInTx(tx, {
        entity: 'match',
        entityId: id,
        action: 'match_confirmed',
        actorId,
        snapshot: {
          runId: match.runId,
          method: match.method,
          confidence: match.confidence,
        },
      });
      return match;
    });
  }
}
