import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { stableStringify } from '../../common/crypto/audit-hash';
import { ReconciliationRepository } from './reconciliation.repository';
import { ARecord, BRecord, matchRecords, summarize } from './matching';
import {
  MatchDto,
  ReconciliationRunDto,
  ReconciliationRunSummaryDto,
  ReconciliationSummaryDto,
  RunReconciliationDto,
} from './dto/reconciliation.dto';

@Injectable()
export class ReconciliationService {
  constructor(private readonly repo: ReconciliationRepository) {}

  /** Run L3 reconciliation over a window of Source A vs Source B, persist it, report. */
  async run(
    dto: RunReconciliationDto,
    actorId: string | null,
  ): Promise<ReconciliationRunDto> {
    const from = new Date(dto.windowFrom);
    const to = new Date(dto.windowTo);
    const sourceA = await this.repo.resolveSource(dto.sourceA);
    const sourceB = await this.repo.resolveSource(dto.sourceB);
    if (!sourceA || !sourceB) {
      throw new BadRequestException('Unknown source A or source B.');
    }

    const aRows = await this.repo.gatherA(sourceA.id, from, to);
    const bRows = await this.repo.gatherB(sourceB.id, from, to);

    const aRecs: ARecord[] = aRows.map((a) => ({
      id: a.id,
      reference: a.reference,
      amount: a.amount,
      direction: a.direction,
      occurredAt: a.occurredAt,
    }));
    const bRecs: BRecord[] = bRows.map((b) => ({
      id: b.id,
      reference: b.reference,
      amount: b.amount,
      direction: b.direction,
      valueDate: b.valueDate,
    }));

    const results = matchRecords(aRecs, bRecs);
    // L2 (source-to-mirror): Source-A records that never reached the ledger.
    const l2Unposted = aRows.filter((a) => a.needsMapping).length;
    const summary = { ...summarize(results), l2Unposted };

    // Offline-verifiable fingerprint of the run (same hashing as /export).
    const doc = {
      sourceAId: sourceA.id,
      sourceBId: sourceB.id,
      windowFrom: from.toISOString(),
      windowTo: to.toISOString(),
      summary,
      matches: results,
    };
    const exportHash = createHash('sha256')
      .update(stableStringify(doc))
      .digest('hex');

    const run = await this.repo.persistRun({
      sourceAId: sourceA.id,
      sourceBId: sourceB.id,
      from,
      to,
      summary,
      exportHash,
      results,
      actorId,
    });

    return this.buildReport(run.id);
  }

  async getReport(runId: string): Promise<ReconciliationRunDto> {
    return this.buildReport(runId);
  }

  async listRuns(): Promise<ReconciliationRunSummaryDto[]> {
    const rows = await this.repo.listRuns(50);
    return rows.map((r) => ({
      runId: r.id,
      sourceAName: r.sourceAName,
      sourceBName: r.sourceBName,
      windowFrom: r.windowFrom.toISOString(),
      windowTo: r.windowTo.toISOString(),
      reconciled: r.reconciled,
      summary: r.summary as unknown as ReconciliationSummaryDto,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async confirm(matchId: string, actorId: string): Promise<MatchDto> {
    const existing = await this.repo.getMatch(matchId);
    if (!existing) throw new NotFoundException(`Match ${matchId} not found.`);
    const m = await this.repo.confirmMatch(matchId, actorId);
    return {
      id: m.id,
      outcome: m.outcome,
      method: m.method,
      confidence: m.confidence,
      sourceRecordId: m.sourceRecordId,
      counterpartyRecordId: m.counterpartyRecordId,
      groupId: m.groupId,
      confirmedBy: m.confirmedBy,
    };
  }

  private async buildReport(runId: string): Promise<ReconciliationRunDto> {
    const run = await this.repo.getRun(runId);
    if (!run) throw new NotFoundException(`Reconciliation run ${runId} not found.`);

    const aRows = await this.repo.gatherA(
      run.sourceAId,
      run.windowFrom,
      run.windowTo,
    );
    const bRows = await this.repo.gatherB(
      run.sourceBId,
      run.windowFrom,
      run.windowTo,
    );

    return {
      runId: run.id,
      sourceAId: run.sourceAId,
      sourceBId: run.sourceBId,
      windowFrom: run.windowFrom.toISOString(),
      windowTo: run.windowTo.toISOString(),
      reconciled: run.reconciled,
      exportHash: run.exportHash ?? '',
      summary: run.summary as unknown as ReconciliationSummaryDto,
      matches: run.matches.map((m) => ({
        id: m.id,
        outcome: m.outcome,
        method: m.method,
        confidence: m.confidence,
        sourceRecordId: m.sourceRecordId,
        counterpartyRecordId: m.counterpartyRecordId,
        groupId: m.groupId,
        confirmedBy: m.confirmedBy,
      })),
      sourceARecords: aRows.map((a) => ({
        id: a.id,
        externalId: a.externalId,
        reference: a.reference,
        amount: a.amount,
        direction: a.direction,
        occurredAt: a.occurredAt.toISOString(),
        matchState: a.matchState,
        needsMapping: a.needsMapping,
      })),
      sourceBRecords: bRows.map((b) => ({
        id: b.id,
        reference: b.reference,
        amount: b.amount,
        direction: b.direction,
        valueDate: b.valueDate.toISOString(),
        matchState: b.matchState,
        rawRow: b.rawRow,
      })),
    };
  }
}
