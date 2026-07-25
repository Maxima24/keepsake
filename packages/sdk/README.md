# keepsake-sdk

Client for [Keepsake](https://github.com/Maxima24/keepsake) — record transactions (**Source A**) into the audit + reconciliation layer beside your ledger. One call at your commit point; the rest (idempotency, retries) is handled.

- **Idempotent** by `externalId` — safe to retry.
- **Auto-retries** transient network / `5xx` errors with exponential backoff.
- **Zero runtime dependencies** — uses the platform `fetch` (Node 18+ or the browser).
- Fully typed.

## Install

```bash
npm install keepsake-sdk
```

## Usage

```ts
import { createKeepsake } from 'keepsake-sdk';

const keepsake = createKeepsake({
  baseUrl: 'https://your-keepsake-api.example.com',
  apiKey: 'sk_live_…', // minted in Keepsake → Integrations
});

// Right after you commit to your own ledger:
const result = await keepsake.record({
  externalId: 'txn_9f8a',              // your id — the idempotency + join key
  occurredAt: new Date().toISOString(),
  source: 'core-ledger',
  reference: 'STL-4412',               // used later for external matching
  entries: [
    { account: 'settlement:pending', direction: 'debit',  amount: 420000 }, // minor units
    { account: 'bank:access',        direction: 'credit', amount: 420000 },
  ],
});
// → { id, externalId, duplicate, needsMapping, transactionId }
```

Amounts are **integer minor units** (cents/kobo) — never floats. Every transaction must balance (debits = credits).

### Batch

```ts
const summary = await keepsake.recordBatch([txnA, txnB, /* … */]);
// → { accepted, duplicates, failed, results }
```

## API

| Export | Description |
|---|---|
| `createKeepsake(options)` | Returns a client. `options`: `{ baseUrl, apiKey, maxRetries?, fetch? }` |
| `client.record(txn)` | Record one transaction. Idempotent by `externalId`. |
| `client.recordBatch(txns)` | Record many; per-item result. |
| `KeepsakeError` | Thrown on a non-retriable API error (carries `status`). |

Types: `KeepsakeTransaction`, `KeepsakeEntry`, `RecordResult`, `BatchResult`, `KeepsakeOptions`, `KeepsakeClient`.

## License

MIT
