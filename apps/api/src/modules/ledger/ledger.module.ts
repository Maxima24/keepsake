import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { LedgerRepository } from './ledger.repository';
import { ReconcileScheduler } from './reconcile.scheduler';

@Module({
  imports: [AuditModule],
  controllers: [LedgerController],
  providers: [LedgerService, LedgerRepository, ReconcileScheduler],
})
export class LedgerModule {}
