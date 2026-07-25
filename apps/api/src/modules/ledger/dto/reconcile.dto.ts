export interface ReconcileAccountDto {
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

export interface ReconcileCheckDto {
  key: ReconcileCheckKey;
  label: string;
  pass: boolean;
  offending: string[]; // ids / seqs of the offending records
}

export interface ReconcileReportDto {
  allInAgreement: boolean; // true iff every check passes
  checks: ReconcileCheckDto[];
  accounts: ReconcileAccountDto[]; // per-account detail for the balance check
}
