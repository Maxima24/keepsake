// TS interfaces mirroring the API DTOs exactly.

export type Direction = 'debit' | 'credit';

export interface Account {
  id: string;
  name: string;
  balance: number; // cached minor units (or as-of derived value)
  createdAt: string;
}

export interface Entry {
  id: string;
  transactionId: string;
  accountId: string;
  direction: Direction;
  amount: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  description: string;
  createdAt: string;
  entries: Entry[];
}

export interface AuditLog {
  id: string;
  seq: string;
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  snapshot: unknown;
  prevHash: string | null;
  hash: string | null;
  createdAt: string;
}

export interface ReconcileAccount {
  accountId: string;
  name: string;
  cachedBalance: number;
  derivedBalance: number;
  inAgreement: boolean;
  difference: number;
}

export type ReconcileCheckKey =
  | 'balance_agreement'
  | 'transaction_self_balance'
  | 'no_orphans'
  | 'chain_validity';

export interface ReconcileCheck {
  key: ReconcileCheckKey;
  label: string;
  pass: boolean;
  offending: string[];
}

export interface ReconcileReport {
  allInAgreement: boolean;
  checks: ReconcileCheck[];
  accounts: ReconcileAccount[];
}

export interface VerifyResult {
  valid: boolean;
  brokenAtSeq: string | null;
  checked: number;
}

export interface ExportDocument {
  at: string;
  generatedAt: string;
  accounts: Account[];
  transactions: Transaction[];
  audit: AuditLog[];
  chainHead: string | null;
  exportHash: string;
}

export interface CreateEntryInput {
  accountId: string;
  direction: Direction;
  amount: number;
}

export interface CreateTransactionInput {
  description: string;
  entries: CreateEntryInput[];
}
