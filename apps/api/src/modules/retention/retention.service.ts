import { Injectable } from '@nestjs/common';
import { AuditRepository } from '../audit/audit.repository';
import { RetentionRepository } from './retention.repository';
import { RetentionPolicyDto } from './dto/retention-policy.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RetentionService {
  constructor(
    private readonly repo: RetentionRepository,
    private readonly audit: AuditRepository,
  ) {}

  async get(): Promise<RetentionPolicyDto> {
    const p = await this.repo.getPolicy();
    return {
      auditRetentionDays: p?.auditRetentionDays ?? null,
      updatedAt: p?.updatedAt.toISOString() ?? null,
      updatedBy: p?.updatedBy ?? null,
    };
  }

  async update(days: number | null, actorId: string): Promise<RetentionPolicyDto> {
    const p = await this.repo.updatePolicy(days, actorId);
    return {
      auditRetentionDays: p.auditRetentionDays,
      updatedAt: p.updatedAt.toISOString(),
      updatedBy: p.updatedBy,
    };
  }

  /**
   * Run archival. Uses an explicit `before` cutoff when given (admin op), else the
   * policy window. Safe by default: with retention off, it's a no-op.
   */
  async archive(
    actorId: string,
    before?: Date,
  ): Promise<{ archived: number; checkpointHash: string | null }> {
    let cutoff = before;
    if (!cutoff) {
      const p = await this.repo.getPolicy();
      const days = p?.auditRetentionDays ?? 0;
      if (!days || days <= 0) return { archived: 0, checkpointHash: null };
      cutoff = new Date(Date.now() - days * DAY_MS);
    }
    return this.audit.archiveOlderThan(cutoff, actorId);
  }
}
