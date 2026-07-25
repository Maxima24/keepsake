import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';

@Injectable()
export class SourcesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
  ) {}

  list() {
    return this.prisma.ingestSource.findMany({ orderBy: { createdAt: 'asc' } });
  }

  get(id: string) {
    return this.prisma.ingestSource.findUnique({ where: { id } });
  }

  getByName(name: string) {
    return this.prisma.ingestSource.findUnique({ where: { name } });
  }

  create(name: string, kind: string) {
    return this.prisma.ingestSource.create({ data: { name, kind } });
  }

  /** Ensure a counterparty source exists (auto-registered on first file upload). */
  ensureCounterparty(name: string) {
    return this.prisma.ingestSource.upsert({
      where: { name },
      update: {},
      create: { name, kind: 'counterparty' },
    });
  }

  /** Set a source's mapping profile, recording the change (a sensitive act) in the chain. */
  async setMapping(
    id: string,
    mapping: Record<string, unknown>,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.ingestSource.findUniqueOrThrow({ where: { id } });
      const updated = await tx.ingestSource.update({
        where: { id },
        data: { mapping: mapping as Prisma.InputJsonValue },
      });
      await this.audit.appendInTx(tx, {
        entity: 'ingest_source',
        entityId: id,
        action: 'mapping_updated',
        actorId,
        snapshot: { before: before.mapping ?? null, after: mapping },
      });
      return updated;
    });
  }
}
