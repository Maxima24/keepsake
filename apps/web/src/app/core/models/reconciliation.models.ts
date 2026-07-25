// TS interfaces mirroring the ingestion/reconciliation API DTOs.

export interface IngestSource {
  id: string;
  name: string;
  kind: string; // 'ledger' | 'counterparty'
  hasMapping: boolean;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  label: string;
  prefix: string;
  serviceUserId: string;
  disabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}
export interface MintedApiKey extends ApiKey {
  key: string; // plaintext, shown once
}

export interface FileRowError {
  row: number;
  error: string;
}
export interface IngestFileResult {
  id: string;
  sourceId: string;
  filename: string;
  contentHash: string;
  rowCount: number;
  errorCount: number;
  status: string;
  errors: FileRowError[];
  createdAt: string;
  duplicate?: boolean;
}

export type MatchOutcome =
  | 'matched'
  | 'unmatched_source_a'
  | 'unmatched_source_b'
  | 'amount_mismatch'
  | 'duplicate';

export interface Match {
  id: string;
  outcome: MatchOutcome;
  method: string;
  confidence: number;
  sourceRecordId: string | null;
  counterpartyRecordId: string | null;
  groupId: string | null;
  confirmedBy: string | null;
}

export interface SourceARecord {
  id: string;
  externalId: string;
  reference: string | null;
  amount: number;
  direction: string;
  occurredAt: string;
  matchState: string;
  needsMapping: boolean;
}
export interface SourceBRecord {
  id: string;
  reference: string | null;
  amount: number;
  direction: string;
  valueDate: string;
  matchState: string;
  rawRow: unknown;
}

export interface ReconciliationSummary {
  matched: number;
  unmatched_source_a: number;
  unmatched_source_b: number;
  amount_mismatch: number;
  duplicate: number;
  l2Unposted: number;
  reconciled: boolean;
}

export interface ReconciliationRun {
  runId: string;
  sourceAId: string;
  sourceBId: string;
  windowFrom: string;
  windowTo: string;
  reconciled: boolean;
  exportHash: string;
  summary: ReconciliationSummary;
  matches: Match[];
  sourceARecords: SourceARecord[];
  sourceBRecords: SourceBRecord[];
}

export interface ReconciliationRunSummary {
  runId: string;
  sourceAName: string;
  sourceBName: string;
  windowFrom: string;
  windowTo: string;
  reconciled: boolean;
  summary: ReconciliationSummary;
  createdAt: string;
}

export interface NeedsMappingRecord {
  id: string;
  source: string;
  externalId: string;
  reference: string | null;
  amount: number;
  occurredAt: string;
}
