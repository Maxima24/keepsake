import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IngestionService } from './ingestion.service';
import {
  IngestBatchDto,
  IngestTransactionDto,
} from './dto/ingest-transaction.dto';
import {
  IngestBatchResultDto,
  IngestResultDto,
  NeedsMappingRecordDto,
} from './dto/ingest-result.dto';

// Reachable by an API key (role 'service') or by admin/accountant JWTs.
@Roles('service', 'admin', 'accountant')
@Controller('ingest')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('transactions')
  @HttpCode(200)
  one(
    @Body() dto: IngestTransactionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<IngestResultDto> {
    return this.ingestion.ingestOne(dto, user.id);
  }

  @Post('transactions/batch')
  @HttpCode(200)
  batch(
    @Body() dto: IngestBatchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<IngestBatchResultDto> {
    return this.ingestion.ingestBatch(dto, user.id);
  }

  @Roles('admin', 'accountant', 'auditor')
  @Get('needs-mapping')
  needsMapping(): Promise<NeedsMappingRecordDto[]> {
    return this.ingestion.listNeedsMapping();
  }
}
