import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { AuditDto } from './dto/audit.dto';
import { VerifyResultDto } from './dto/verify.dto';

@Roles('admin', 'accountant', 'auditor')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  getAll(): Promise<AuditDto[]> {
    return this.audit.getAll();
  }

  @Get('archive')
  getArchive(): Promise<AuditDto[]> {
    return this.audit.getArchive();
  }

  @Get('verify')
  verify(): Promise<VerifyResultDto> {
    return this.audit.verify();
  }
}
