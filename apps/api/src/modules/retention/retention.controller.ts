import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RetentionService } from './retention.service';
import { UpdateRetentionDto } from './dto/update-retention.dto';
import { RetentionPolicyDto } from './dto/retention-policy.dto';

@Roles('admin')
@Controller('retention')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get()
  get(): Promise<RetentionPolicyDto> {
    return this.retention.get();
  }

  @Put()
  update(
    @Body() dto: UpdateRetentionDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<RetentionPolicyDto> {
    return this.retention.update(dto.auditRetentionDays ?? null, actor.id);
  }

  @Post('archive')
  archive(@CurrentUser() actor: AuthUser, @Query('before') before?: string) {
    let cutoff: Date | undefined;
    if (before) {
      cutoff = new Date(before);
      if (Number.isNaN(cutoff.getTime())) {
        throw new BadRequestException('Invalid "before" timestamp (use ISO 8601).');
      }
    }
    return this.retention.archive(actor.id, cutoff);
  }
}
