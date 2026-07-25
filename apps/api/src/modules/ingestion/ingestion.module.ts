import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { IngestionRepository } from './ingestion.repository';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { SourcesRepository } from './sources.repository';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FilesRepository } from './files.repository';

@Module({
  imports: [AuditModule],
  controllers: [IngestionController, SourcesController, FilesController],
  providers: [
    IngestionService,
    IngestionRepository,
    SourcesService,
    SourcesRepository,
    FilesService,
    FilesRepository,
  ],
  exports: [SourcesRepository], // reused by the reconciliation module (P4)
})
export class IngestionModule {}
