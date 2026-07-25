import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { LedgerRepository } from './ledger.repository';
import { AuditRepository } from '../audit/audit.repository';
import { toAuditDto } from '../audit/audit.mapper';
import { stableStringify } from '../../common/crypto/audit-hash';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { AccountDto } from './dto/account.dto';
import { TransactionDto } from './dto/transaction.dto';
import { ExportDocumentDto } from './dto/export.dto';
import {
  ReconcileAccountDto,
  ReconcileCheckDto,
  ReconcileReportDto,
} from './dto/reconcile.dto';
import { toAccountDto, toTransactionDto } from './ledger.mapper';

@Injectable()
export class LedgerService {
  constructor(
    private readonly repo: LedgerRepository,
    private readonly audit: AuditRepository,
  ) {}

  async postTransaction(
    dto: CreateTransactionDto,
    actorId: string | null,
  ): Promise<TransactionDto> {
    const created = await this.repo.postTransaction(dto, actorId);
    return toTransactionDto(created);
  }

  async getAccounts(): Promise<AccountDto[]> {
    const accounts = await this.repo.findAccounts();
    return accounts.map(toAccountDto);
  }

  async getTransactions(): Promise<TransactionDto[]> {
    const transactions = await this.repo.findTransactions();
    return transactions.map(toTransactionDto);
  }

  /**
   * Full integrity report — four independent checks plus the audit chain:
   *  1. cached balances agree with the derived sum of entries
   *  2. every transaction self-balances (debits = credits) in the DB
   *  3. no orphaned entries; every transaction has >= 2 entries
   *  4. the audit hash chain is intact
   */
  async reconcile(): Promise<ReconcileReportDto> {
    const [accounts, grouped, unbalancedTx, orphans, chain] = await Promise.all([
      this.repo.findAccounts(),
      this.repo.sumEntriesByAccount(),
      this.repo.findUnbalancedTransactions(),
      this.repo.findOrphans(),
      this.audit.verifyChain(),
    ]);

    const derived = new Map<string, number>();
    for (const g of grouped) {
      const sum = g._sum.amount ?? 0;
      const signed = g.direction === 'debit' ? sum : -sum;
      derived.set(g.accountId, (derived.get(g.accountId) ?? 0) + signed);
    }

    const accountRows: ReconcileAccountDto[] = accounts.map((a) => {
      const derivedBalance = derived.get(a.id) ?? 0;
      const difference = a.balance - derivedBalance;
      return {
        accountId: a.id,
        name: a.name,
        cachedBalance: a.balance,
        derivedBalance,
        inAgreement: difference === 0,
        difference,
      };
    });

    const balanceOffending = accountRows
      .filter((r) => !r.inAgreement)
      .map((r) => r.accountId);
    const orphanOffending = [
      ...orphans.entriesMissingAccount,
      ...orphans.entriesMissingTransaction,
      ...orphans.transactionsUnderTwoEntries,
    ];

    const checks: ReconcileCheckDto[] = [
      {
        key: 'balance_agreement',
        label: 'Cached balances match the sum of entries',
        pass: balanceOffending.length === 0,
        offending: balanceOffending,
      },
      {
        key: 'transaction_self_balance',
        label: 'Every transaction self-balances (debits = credits)',
        pass: unbalancedTx.length === 0,
        offending: unbalancedTx,
      },
      {
        key: 'no_orphans',
        label: 'No orphaned entries; every transaction has at least 2 entries',
        pass: orphanOffending.length === 0,
        offending: orphanOffending,
      },
      {
        key: 'chain_validity',
        label: 'Audit hash chain is intact',
        pass: chain.valid,
        offending: chain.valid ? [] : [String(chain.brokenAtSeq)],
      },
    ];

    return {
      allInAgreement: checks.every((c) => c.pass),
      checks,
      accounts: accountRows,
    };
  }

  // ---- Point-in-time recovery & verifiable export ----

  /** Account balances derived from entries created at/before `at` (never the cache). */
  async accountsAsOf(at: Date): Promise<AccountDto[]> {
    const [accounts, grouped] = await Promise.all([
      this.repo.findAccounts(),
      this.repo.sumEntriesByAccountAsOf(at),
    ]);
    const derived = new Map<string, number>();
    for (const g of grouped) {
      const sum = g._sum.amount ?? 0;
      const signed = g.direction === 'debit' ? sum : -sum;
      derived.set(g.accountId, (derived.get(g.accountId) ?? 0) + signed);
    }
    return accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: derived.get(a.id) ?? 0,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async transactionsAsOf(at: Date): Promise<TransactionDto[]> {
    const txns = await this.repo.findTransactionsAsOf(at);
    return txns.map(toTransactionDto);
  }

  /** Self-verifying export: as-of state + the audit chain up to `at` + a document hash. */
  async buildExport(at: Date): Promise<ExportDocumentDto> {
    const [accounts, transactions, auditRows] = await Promise.all([
      this.accountsAsOf(at),
      this.transactionsAsOf(at),
      this.audit.findUpTo(at),
    ]);
    const audit = auditRows.map(toAuditDto);
    const chainHead = audit.length ? audit[audit.length - 1].hash : null;
    const doc = {
      at: at.toISOString(),
      generatedAt: new Date().toISOString(),
      accounts,
      transactions,
      audit,
      chainHead,
    };
    const exportHash = createHash('sha256')
      .update(stableStringify(doc))
      .digest('hex');
    return { ...doc, exportHash };
  }
}
