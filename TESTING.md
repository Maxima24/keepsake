# Testing

Keepsake has three layers of automated tests. Integration tests run against a **real Postgres** (never mock Prisma — the guarantees are database guarantees) using a dedicated `keepsake_test` database that is reset between tests. **Never point the suite at the dev DB (`keepsake`).**

## Run

```bash
# Backend — integration + unit (Jest, against keepsake_test on port 5544)
pnpm --filter api test
#   filter to specific suites:
pnpm --filter api test matching ingestion-reconciliation

# Frontend — component/logic specs (Karma + headless Edge)
pnpm --filter web test

# SDK — typecheck
pnpm --filter @keepsake/sdk typecheck
```

The backend harness (`apps/api/test/setup/`) creates + migrates `keepsake_test` in `globalSetup`, loads `.env.test`, and `resetDb()` truncates every table (including the ingestion/reconciliation tables) and reseeds 3 accounts + 4 role users before each test. It runs `--runInBand` since suites share the one test DB.

## Backend suites (`apps/api/test/`)

| Suite | Proves |
|---|---|
| `ledger.e2e-spec.ts` | Atomic balanced posting; unbalanced/invalid posts leak nothing |
| `auth.e2e-spec.ts` | Register/login, no `passwordHash` ever leaves the API |
| `rbac.e2e-spec.ts` | Full role matrix (allow + deny per role), default-deny |
| `audit-hash.spec.ts` / `audit-chain.e2e-spec.ts` | Hash-chain canonicalization; tamper-at-seq is caught; concurrent posts keep distinct sequential seq |
| `reconcile.e2e-spec.ts` | L1 internal integrity — the 4 checks + the scheduler |
| `pitr-export.e2e-spec.ts` | As-of balances; self-verifying export; one-byte tamper fails offline verify |
| `retention.e2e-spec.ts` | Archival copies-then-prunes; refuses if it would break verifiability |
| **`matching.spec.ts`** | **The matching engine (pure unit): ref_amount, amount_mismatch, fuzzy + tolerance, N:1 aggregate, duplicate flag, `reconciled`** |
| **`ingestion-reconciliation.e2e-spec.ts`** | **API-key auth (valid/revoked/none), idempotent ingest, `needsMapping`, CSV import + content-hash dedupe, a matched reconciliation run with the audit chain intact, and re-run self-healing a break** |

## Frontend specs (`apps/web/src/app/**/*.spec.ts`)

`format.spec.ts` (minor-unit formatting), `state/ui.store.spec.ts` (post-form signal logic), `app.component.spec.ts` (role-gated nav + integrity badge). Run headless against Edge via `karma.conf.js` (`CHROME_BIN` → Edge).

## Adversarial guarantee

Every invariant has at least one test proven able to fail (temporarily break the code, confirm red, restore) — e.g. the ledger leak test, the chain concurrency test, the export tamper test.

## Status

Whole stack green:
- **Backend:** `pnpm --filter api test` → **11 suites, 72 tests passing** (includes the new `matching.spec.ts` and `ingestion-reconciliation.e2e-spec.ts`).
- **Frontend:** `pnpm --filter web test` → **28 specs passing**; `pnpm --filter web build` (AOT) green.

Prerequisite for the backend suite: Docker running with the `keepsake-postgres` container up (`docker compose up -d`) — the harness creates/migrates `keepsake_test` on port 5544 via `docker exec`.
