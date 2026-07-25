export interface IngestResultDto {
  id: string; // IngestedTransaction id
  externalId: string;
  duplicate: boolean; // true if this externalId was already ingested (no new write)
  needsMapping: boolean; // true if an account name could not be resolved (not posted to the ledger)
  transactionId: string | null; // ledger Transaction id when posted, else null
}

export interface IngestBatchItemError {
  externalId: string;
  error: string;
}

/** A Source-A record that could not resolve an account and never posted to the ledger. */
export interface NeedsMappingRecordDto {
  id: string;
  source: string;
  externalId: string;
  reference: string | null;
  amount: number;
  occurredAt: string;
}

export interface IngestBatchResultDto {
  accepted: number;
  duplicates: number;
  failed: number;
  results: Array<IngestResultDto | IngestBatchItemError>;
}
