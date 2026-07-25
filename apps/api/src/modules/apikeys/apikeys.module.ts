import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ApiKeyController } from './apikeys.controller';
import { ApiKeyService } from './apikeys.service';
import { ApiKeyRepository } from './apikeys.repository';

@Module({
  imports: [AuditModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, ApiKeyRepository],
  exports: [ApiKeyService], // the CompositeAuthGuard authenticates keys through this
})
export class ApiKeysModule {}
