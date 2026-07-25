import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReconciliationService } from './reconciliation.service';
import {
  MatchDto,
  ReconciliationRunDto,
  ReconciliationRunSummaryDto,
  RunReconciliationDto,
} from './dto/reconciliation.dto';

@Roles('admin', 'accountant', 'auditor')
@Controller()
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Roles('admin', 'accountant')
  @Post('reconciliation/runs')
  run(
    @Body() dto: RunReconciliationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReconciliationRunDto> {
    return this.reconciliation.run(dto, user.id);
  }

  // NOTE: must be declared before ':runId' so the literal path wins the match.
  @Get('reconciliation/runs')
  listRuns(): Promise<ReconciliationRunSummaryDto[]> {
    return this.reconciliation.listRuns();
  }

  @Get('reconciliation/:runId')
  get(@Param('runId') runId: string): Promise<ReconciliationRunDto> {
    return this.reconciliation.getReport(runId);
  }

  @Roles('admin', 'accountant')
  @Post('matches/:id/confirm')
  confirm(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<MatchDto> {
    return this.reconciliation.confirm(id, user.id);
  }
}
