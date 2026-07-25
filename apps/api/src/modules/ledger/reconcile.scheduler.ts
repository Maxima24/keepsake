import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AuditRepository } from '../audit/audit.repository';
import { LedgerService } from './ledger.service';

// Configurable so tests can run it fast; production would use minutes.
const RECONCILE_INTERVAL_MS = Number(
  process.env.RECONCILE_INTERVAL_MS ?? 60_000,
);

@Injectable()
export class ReconcileScheduler {
  private readonly logger = new Logger(ReconcileScheduler.name);

  constructor(
    private readonly ledger: LedgerService,
    private readonly audit: AuditRepository,
  ) {}

  /** Runs the full integrity report; audits a failure (once), stays quiet on pass. */
  @Interval('reconcile-check', RECONCILE_INTERVAL_MS)
  async run(): Promise<void> {
    const report = await this.ledger.reconcile();
    if (report.allInAgreement) return; // passing runs do not spam the log

    const failed = report.checks
      .filter((c) => !c.pass)
      .map((c) => c.key)
      .join(', ');
    this.logger.warn(`Reconciliation failed: ${failed}`);

    await this.audit.append({
      entity: 'reconcile',
      entityId: 'system',
      action: 'reconcile_failed',
      actorId: null,
      snapshot: report as unknown,
    });
  }
}
