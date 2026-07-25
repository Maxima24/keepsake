import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';
import { RetentionRepository } from './retention.repository';

@Module({
  imports: [AuditModule],
  controllers: [RetentionController],
  providers: [RetentionService, RetentionRepository],
})
export class RetentionModule {}
