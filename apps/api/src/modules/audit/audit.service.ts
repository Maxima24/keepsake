import { Injectable } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { toAuditDto } from './audit.mapper';
import { AuditDto } from './dto/audit.dto';
import { VerifyResultDto } from './dto/verify.dto';

@Injectable()
export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async getAll(): Promise<AuditDto[]> {
    const rows = await this.repo.findAll();
    return rows.map(toAuditDto);
  }

  async getArchive(): Promise<AuditDto[]> {
    const rows = await this.repo.findArchive();
    return rows.map(toAuditDto);
  }

  verify(): Promise<VerifyResultDto> {
    return this.repo.verifyChain();
  }
}
