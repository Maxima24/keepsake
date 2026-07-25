import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class RunReconciliationDto {
  @IsString()
  @IsNotEmpty()
  sourceA!: string; // Source A (ledger mirror) id or name

  @IsString()
  @IsNotEmpty()
  sourceB!: string; // Source B (counterparty) id or name

  @IsDateString()
  windowFrom!: string;

  @IsDateString()
  windowTo!: string;
}

export interface MatchDto {
  id: string;
  outcome: string;
  method: string;
  confidence: number;
  sourceRecordId: string | null;
  counterpartyRecordId: string | null;
  groupId: string | null;
  confirmedBy: string | null;
}

// Drill-in payloads: the raw record on each side of a break.
export interface SourceARecordDto {
  id: string;
  externalId: string;
  reference: string | null;
  amount: number;
  direction: string;
  occurredAt: string;
  matchState: string;
  needsMapping: boolean;
}
export interface SourceBRecordDto {
  id: string;
  reference: string | null;
  amount: number;
  direction: string;
  valueDate: string;
  matchState: string;
  rawRow: unknown;
}

export interface ReconciliationSummaryDto {
  matched: number;
  unmatched_source_a: number;
  unmatched_source_b: number;
  amount_mismatch: number;
  duplicate: number;
  l2Unposted: number; // Source-A records that never posted to the ledger (needsMapping)
  reconciled: boolean;
}

export interface ReconciliationRunDto {
  runId: string;
  sourceAId: string;
  sourceBId: string;
  windowFrom: string;
  windowTo: string;
  reconciled: boolean;
  exportHash: string;
  summary: ReconciliationSummaryDto;
  matches: MatchDto[];
  sourceARecords: SourceARecordDto[];
  sourceBRecords: SourceBRecordDto[];
}

/** Lightweight row for the run-history list (no per-record drill-in payloads). */
export interface ReconciliationRunSummaryDto {
  runId: string;
  sourceAName: string;
  sourceBName: string;
  windowFrom: string;
  windowTo: string;
  reconciled: boolean;
  summary: ReconciliationSummaryDto;
  createdAt: string;
}
