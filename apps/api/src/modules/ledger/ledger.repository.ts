import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { CreateTransactionDto } from './dto/create-transaction.dto';

/**
 * Balance convention (applied consistently everywhere, incl. reconciliation):
 *   debit  => balance += amount
 *   credit => balance -= amount
 */
export function signedAmount(direction: string, amount: number): number {
  return direction === 'debit' ? amount : -amount;
}

export interface PostCoreEntry {
  accountId: string;
  direction: 'debit' | 'credit';
  amount: number;
}
export interface PostCoreInput {
  description: string;
  entries: PostCoreEntry[];
}

/**
 * The shared, audit-free core of posting a balanced transaction: validate → create
 * transaction + entries → update cached balances, all against a caller-supplied
 * `tx`. Both `LedgerRepository.postTransaction` (audits 'created') and the ingestion
 * flow (audits 'ingested') call this so the invariants live in exactly one place.
 * Throws BadRequestException on any invalid input, persisting nothing.
 */
export async function postTransactionCore(
  tx: Prisma.TransactionClient,
  input: PostCoreInput,
) {
  if (input.entries.length < 2) {
    throw new BadRequestException('A transaction must have at least 2 entries.');
  }
  for (const e of input.entries) {
    if (!Number.isInteger(e.amount) || e.amount <= 0) {
      throw new BadRequestException(
        'Every entry amount must be a positive integer (minor units).',
      );
    }
  }

  const debitSum = input.entries
    .filter((e) => e.direction === 'debit')
    .reduce((sum, e) => sum + e.amount, 0);
  const creditSum = input.entries
    .filter((e) => e.direction === 'credit')
    .reduce((sum, e) => sum + e.amount, 0);
  if (debitSum !== creditSum) {
    throw new BadRequestException(
      `Unbalanced transaction: debits (${debitSum}) must equal credits (${creditSum}).`,
    );
  }

  const accountIds = [...new Set(input.entries.map((e) => e.accountId))];
  const accounts = await tx.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true },
  });
  if (accounts.length !== accountIds.length) {
    const found = new Set(accounts.map((a) => a.id));
    const missing = accountIds.filter((id) => !found.has(id));
    throw new BadRequestException(`Unknown accountId(s): ${missing.join(', ')}`);
  }

  const created = await tx.transaction.create({
    data: { description: input.description },
  });
  await tx.entry.createMany({
    data: input.entries.map((e) => ({
      transactionId: created.id,
      accountId: e.accountId,
      direction: e.direction,
      amount: e.amount,
    })),
  });
  for (const e of input.entries) {
    await tx.account.update({
      where: { id: e.accountId },
      data: { balance: { increment: signedAmount(e.direction, e.amount) } },
    });
  }
  return tx.transaction.findUniqueOrThrow({
    where: { id: created.id },
    include: { entries: true },
  });
}

/**
 * The ONLY file in the ledger module that touches Prisma. The atomic
 * `$transaction` wrapper for posting lives here.
 */
@Injectable()
export class LedgerRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
  ) {}

  /**
   * Atomically post a balanced transaction. Validation runs first, BEFORE any
   * write, all inside a single interactive transaction — so an invalid post
   * throws and nothing is persisted (all-or-nothing).
   */
  async postTransaction(dto: CreateTransactionDto, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const full = await postTransactionCore(tx, {
        description: dto.description,
        entries: dto.entries,
      });

      // Append-only, hash-chained audit row (created, never updated/deleted).
      await this.audit.appendInTx(tx, {
        entity: 'transaction',
        entityId: full.id,
        action: 'created',
        actorId,
        snapshot: JSON.parse(JSON.stringify(full)),
      });

      return full;
    });
  }

  findAccounts() {
    return this.prisma.account.findMany({ orderBy: { name: 'asc' } });
  }

  findTransactions() {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      include: { entries: true },
    });
  }

  /** Aggregate signed entry sums per account, in the database. */
  sumEntriesByAccount() {
    return this.prisma.entry.groupBy({
      by: ['accountId', 'direction'],
      _sum: { amount: true },
    });
  }

  /** Signed entry sums per account, considering only entries created at/before `at`. */
  sumEntriesByAccountAsOf(at: Date) {
    return this.prisma.entry.groupBy({
      by: ['accountId', 'direction'],
      where: { createdAt: { lte: at } },
      _sum: { amount: true },
    });
  }

  /** Transactions created at/before `at`, newest first, with their entries. */
  findTransactionsAsOf(at: Date) {
    return this.prisma.transaction.findMany({
      where: { createdAt: { lte: at } },
      orderBy: { createdAt: 'desc' },
      include: { entries: true },
    });
  }

  /** Transaction ids whose own entries do not sum to zero (debits != credits). */
  async findUnbalancedTransactions(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ transactionId: string }[]>`
      SELECT "transactionId"
      FROM "Entry"
      GROUP BY "transactionId"
      HAVING SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) <> 0
    `;
    return rows.map((r) => r.transactionId);
  }

  /** Orphan checks: entries pointing at missing rows, and thin transactions. */
  async findOrphans(): Promise<{
    entriesMissingAccount: string[];
    entriesMissingTransaction: string[];
    transactionsUnderTwoEntries: string[];
  }> {
    const missingAccount = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT e.id FROM "Entry" e
      LEFT JOIN "Account" a ON e."accountId" = a.id WHERE a.id IS NULL
    `;
    const missingTransaction = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT e.id FROM "Entry" e
      LEFT JOIN "Transaction" t ON e."transactionId" = t.id WHERE t.id IS NULL
    `;
    const underTwo = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT t.id FROM "Transaction" t
      LEFT JOIN "Entry" e ON e."transactionId" = t.id
      GROUP BY t.id HAVING COUNT(e.id) < 2
    `;
    return {
      entriesMissingAccount: missingAccount.map((r) => r.id),
      entriesMissingTransaction: missingTransaction.map((r) => r.id),
      transactionsUnderTwoEntries: underTwo.map((r) => r.id),
    };
  }
}
