import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LedgerService } from './ledger.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { AccountDto } from './dto/account.dto';
import { TransactionDto } from './dto/transaction.dto';
import { ExportDocumentDto } from './dto/export.dto';
import { ReconcileReportDto } from './dto/reconcile.dto';

@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Roles('admin', 'accountant')
  @Post('transactions')
  postTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransactionDto> {
    return this.ledger.postTransaction(dto, user.id);
  }

  @Roles('admin', 'accountant', 'auditor', 'viewer')
  @Get('accounts')
  getAccounts(): Promise<AccountDto[]> {
    return this.ledger.getAccounts();
  }

  @Roles('admin', 'accountant', 'auditor', 'viewer')
  @Get('transactions')
  getTransactions(): Promise<TransactionDto[]> {
    return this.ledger.getTransactions();
  }

  @Roles('admin', 'accountant', 'auditor')
  @Get('reconcile')
  reconcile(): Promise<ReconcileReportDto> {
    return this.ledger.reconcile();
  }

  // ---- Point-in-time recovery & verifiable export ----

  @Roles('admin', 'accountant', 'auditor')
  @Get('accounts/as-of')
  accountsAsOf(@Query('at') at: string): Promise<AccountDto[]> {
    return this.ledger.accountsAsOf(this.parseAt(at));
  }

  @Roles('admin', 'accountant', 'auditor')
  @Get('transactions/as-of')
  transactionsAsOf(@Query('at') at: string): Promise<TransactionDto[]> {
    return this.ledger.transactionsAsOf(this.parseAt(at));
  }

  @Roles('admin', 'accountant', 'auditor')
  @Get('export')
  export(@Query('at') at: string): Promise<ExportDocumentDto> {
    return this.ledger.buildExport(this.parseAt(at));
  }

  private parseAt(at: string): Date {
    const d = at ? new Date(at) : new Date();
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid "at" timestamp (use ISO 8601).');
    }
    return d;
  }
}
