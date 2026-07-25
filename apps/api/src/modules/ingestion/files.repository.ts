import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';

export interface ImportRecord {
  reference: string | null;
  amount: number;
  direction: string;
  valueDate: Date;
  rawRow: Record<string, string>;
}
export interface ImportError {
  row: number;
  error: string;
}

@Injectable()
export class FilesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
  ) {}

  findByContentHash(contentHash: string) {
    return this.prisma.ingestFile.findUnique({ where: { contentHash } });
  }

  get(id: string) {
    return this.prisma.ingestFile.findUnique({ where: { id } });
  }

  /** Persist a parsed file + its counterparty rows + a 'file_imported' audit row, atomically. */
  async importFile(input: {
    sourceId: string;
    filename: string;
    contentHash: string;
    records: ImportRecord[];
    errors: ImportError[];
    actorId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const file = await tx.ingestFile.create({
        data: {
          sourceId: input.sourceId,
          filename: input.filename,
          contentHash: input.contentHash,
          rowCount: input.records.length,
          errorCount: input.errors.length,
          status:
            input.records.length === 0 && input.errors.length > 0
              ? 'failed'
              : 'parsed',
          errors: input.errors.length
            ? (input.errors as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });

      if (input.records.length) {
        await tx.counterpartyRecord.createMany({
          data: input.records.map((r) => ({
            fileId: file.id,
            sourceId: input.sourceId,
            reference: r.reference,
            amount: r.amount,
            direction: r.direction,
            valueDate: r.valueDate,
            rawRow: r.rawRow as unknown as Prisma.InputJsonValue,
          })),
        });
      }

      await this.audit.appendInTx(tx, {
        entity: 'ingest_file',
        entityId: file.id,
        action: 'file_imported',
        actorId: input.actorId,
        snapshot: {
          filename: input.filename,
          contentHash: input.contentHash,
          rowCount: input.records.length,
          errorCount: input.errors.length,
        },
      });

      return file;
    });
  }
}
