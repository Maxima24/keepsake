export interface EntryDto {
  id: string;
  transactionId: string;
  accountId: string;
  direction: 'debit' | 'credit';
  amount: number; // positive minor units
  createdAt: string; // ISO string
}

export interface TransactionDto {
  id: string;
  description: string;
  createdAt: string; // ISO string
  entries: EntryDto[];
}
