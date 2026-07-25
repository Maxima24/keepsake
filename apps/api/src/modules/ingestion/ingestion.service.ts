import { Injectable } from '@nestjs/common';
import { IngestionRepository } from './ingestion.repository';
import {
  IngestBatchDto,
  IngestTransactionDto,
} from './dto/ingest-transaction.dto';
import {
  IngestBatchItemError,
  IngestBatchResultDto,
  IngestResultDto,
  NeedsMappingRecordDto,
} from './dto/ingest-result.dto';

/** Duck-typed check so the service never imports the Prisma runtime (layering). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class IngestionService {
  constructor(private readonly repo: IngestionRepository) {}

  async ingestOne(
    dto: IngestTransactionDto,
    actorId: string,
  ): Promise<IngestResultDto> {
    try {
      const { record, duplicate } = await this.repo.ingest(dto, actorId);
      return {
        id: record.id,
        externalId: dto.externalId,
        duplicate,
        needsMapping: record.needsMapping,
        transactionId: record.transactionId,
      };
    } catch (err) {
      // Lost idempotency race: the unique (source, externalId) now exists.
      if (isUniqueViolation(err)) {
        const existing = await this.repo.findByExternalId(
          dto.source,
          dto.externalId,
        );
        if (existing) {
          return {
            id: existing.id,
            externalId: dto.externalId,
            duplicate: true,
            needsMapping: existing.needsMapping,
            transactionId: existing.transactionId,
          };
        }
      }
      throw err;
    }
  }

  async listNeedsMapping(): Promise<NeedsMappingRecordDto[]> {
    const rows = await this.repo.listNeedsMapping(100);
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      externalId: r.externalId,
      reference: r.reference,
      amount: r.amount,
      occurredAt: r.occurredAt.toISOString(),
    }));
  }

  async ingestBatch(
    dto: IngestBatchDto,
    actorId: string,
  ): Promise<IngestBatchResultDto> {
    const results: Array<IngestResultDto | IngestBatchItemError> = [];
    let accepted = 0;
    let duplicates = 0;
    let failed = 0;

    // Each item is its own transaction → one bad row never rolls back the rest.
    for (const t of dto.transactions) {
      try {
        const r = await this.ingestOne(t, actorId);
        results.push(r);
        if (r.duplicate) duplicates++;
        else accepted++;
      } catch (err) {
        failed++;
        results.push({
          externalId: t.externalId,
          error: err instanceof Error ? err.message : 'ingest failed',
        });
      }
    }
    return { accepted, duplicates, failed, results };
  }
}
