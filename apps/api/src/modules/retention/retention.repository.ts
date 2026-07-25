import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';

@Injectable()
export class RetentionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
  ) {}

  getPolicy() {
    return this.prisma.retentionPolicy.findUnique({ where: { id: 'default' } });
  }

  /** Upsert the policy and record the change in the audit chain, atomically. */
  updatePolicy(auditRetentionDays: number | null, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.retentionPolicy.findUnique({
        where: { id: 'default' },
      });
      const policy = await tx.retentionPolicy.upsert({
        where: { id: 'default' },
        update: { auditRetentionDays, updatedBy: actorId },
        create: { id: 'default', auditRetentionDays, updatedBy: actorId },
      });
      await this.audit.appendInTx(tx, {
        entity: 'retention',
        entityId: 'default',
        action: 'retention_updated',
        actorId,
        snapshot: {
          before: { auditRetentionDays: before?.auditRetentionDays ?? null },
          after: { auditRetentionDays },
        },
      });
      return policy;
    });
  }
}
