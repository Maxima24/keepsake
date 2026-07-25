import { AccountDto } from './dto/account.dto';
import { EntryDto, TransactionDto } from './dto/transaction.dto';

/*
 * Pure Prisma-model -> DTO mappers. Deliberately typed against structural row
 * shapes (not Prisma types) so this file stays free of any Prisma import — the
 * boundary where `Date` becomes an ISO string and no Prisma model leaks out.
 */

interface AccountRow {
  id: string;
  name: string;
  balance: number;
  createdAt: Date;
}

interface EntryRow {
  id: string;
  transactionId: string;
  accountId: string;
  direction: string;
  amount: number;
  createdAt: Date;
}

interface TransactionRow {
  id: string;
  description: string;
  createdAt: Date;
  entries: EntryRow[];
}

export function toAccountDto(row: AccountRow): AccountDto {
  return {
    id: row.id,
    name: row.name,
    balance: row.balance,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toEntryDto(row: EntryRow): EntryDto {
  return {
    id: row.id,
    transactionId: row.transactionId,
    accountId: row.accountId,
    direction: row.direction === 'credit' ? 'credit' : 'debit',
    amount: row.amount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTransactionDto(row: TransactionRow): TransactionDto {
  return {
    id: row.id,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    entries: row.entries.map(toEntryDto),
  };
}

