/**
 * keepsake-sdk — record transactions into Keepsake (Source A).
 *
 *   import { createKeepsake } from 'keepsake-sdk';
 *   const keepsake = createKeepsake({ baseUrl: 'https://…', apiKey: 'sk_live_…' });
 *   await keepsake.record({
 *     externalId: 'txn_9f8a', occurredAt: new Date().toISOString(), source: 'core-ledger',
 *     entries: [
 *       { account: 'settlement:pending', direction: 'debit',  amount: 420000 },
 *       { account: 'bank:access',        direction: 'credit', amount: 420000 },
 *     ],
 *   });
 *
 * Idempotent by `externalId` (safe to retry). Automatically retries transient
 * network/5xx errors with exponential backoff. No runtime dependencies.
 */

export interface KeepsakeEntry {
  account: string; // account name (mapped to a Keepsake account)
  direction: 'debit' | 'credit';
  amount: number; // positive integer minor units (cents/kobo) — never floats
}

export interface KeepsakeTransaction {
  externalId: string; // your id — the idempotency + join key
  occurredAt: string; // ISO 8601
  source: string; // ingest source name, e.g. 'core-ledger'
  description?: string;
  reference?: string; // used later for external matching
  entries: KeepsakeEntry[];
  metadata?: Record<string, unknown>;
}

export interface RecordResult {
  id: string;
  externalId: string;
  duplicate: boolean;
  needsMapping: boolean;
  transactionId: string | null;
}

export interface BatchResult {
  accepted: number;
  duplicates: number;
  failed: number;
  results: Array<RecordResult | { externalId: string; error: string }>;
}

export interface KeepsakeOptions {
  baseUrl: string;
  apiKey: string;
  maxRetries?: number; // default 3
  fetch?: typeof fetch; // inject for tests / non-global-fetch runtimes
}

export class KeepsakeError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`Keepsake API error ${status}: ${message}`);
    this.name = 'KeepsakeError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface KeepsakeClient {
  record(txn: KeepsakeTransaction): Promise<RecordResult>;
  recordBatch(txns: KeepsakeTransaction[]): Promise<BatchResult>;
}

export function createKeepsake(opts: KeepsakeOptions): KeepsakeClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  if (!doFetch) {
    throw new Error(
      'No fetch available — pass options.fetch or run on Node 18+ / a browser.',
    );
  }
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const maxRetries = opts.maxRetries ?? 3;

  async function request<T>(
    path: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        const res = await doFetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': opts.apiKey,
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
          body: JSON.stringify(body),
        });

        if (res.status >= 500 && attempt < maxRetries) {
          await sleep(2 ** attempt * 100);
          attempt++;
          continue;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new KeepsakeError(res.status, text);
        }
        return (await res.json()) as T;
      } catch (err) {
        // Retry transient network failures (fetch throws TypeError), not API errors.
        if (err instanceof KeepsakeError) throw err;
        if (attempt < maxRetries) {
          await sleep(2 ** attempt * 100);
          attempt++;
          continue;
        }
        throw err;
      }
    }
  }

  return {
    record: (txn) =>
      request<RecordResult>('/ingest/transactions', txn, txn.externalId),
    recordBatch: (txns) =>
      request<BatchResult>('/ingest/transactions/batch', {
        transactions: txns,
      }),
  };
}
