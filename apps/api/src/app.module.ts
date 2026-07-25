import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { RetentionModule } from './modules/retention/retention.module';
import { ApiKeysModule } from './modules/apikeys/apikeys.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { CompositeAuthGuard } from './common/guards/composite-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AuditModule,
    LedgerModule,
    RetentionModule,
    ApiKeysModule,
    IngestionModule,
    ReconciliationModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate (JWT or API key) first, then authorize (roles).
    { provide: APP_GUARD, useClass: CompositeAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
