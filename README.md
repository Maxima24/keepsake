# Keepsake

An auditable **double-entry ledger**. Money is recorded correctly by construction:
debits must equal credits and are written atomically, every change is captured in an
append-only audit trail, and a reconciliation check proves the cached balances agree
with the underlying entries.

## Stack

- **Turborepo** + **pnpm** workspaces · Node 20+
- **NestJS** API (`apps/api`) with a strict `Controller → Service → Repository → Mapper → DTO` layering
- **PostgreSQL 16** (Docker) + **Prisma 7** (new `prisma-client` generator + `@prisma/adapter-pg` driver adapter)
- **Angular 19** standalone frontend (`apps/web`) with **Tailwind CSS v4**, **TanStack Query** (server state) and **Angular signals** (UI state)

## Hard invariants

1. **Atomic balanced writes.** Posting validates `sum(debits) === sum(credits)` and writes the
   transaction, its entries, the audit row and the balance updates inside a single
   `prisma.$transaction()` (in the repository). Any failure rolls everything back — no partial writes.
2. **Append-only audit.** `AuditLog` rows are only ever created, never updated or deleted.
3. **Balance is a cache.** `Account.balance` is a cached column; reconciliation derives the truth
   from the entries and compares.
4. **Money is integers.** Amounts are positive integer **minor units** (e.g. cents); direction
   (`debit`/`credit`) sets the sign. No floats.
5. **Layering.** Prisma is imported **only** in `ledger.repository.ts`; controllers return DTOs only
   (never Prisma models). The mapper turns Prisma rows into DTOs (`Date → ISO string`).

**Balance convention:** `debit` increases balance (`+amount`), `credit` decreases it (`-amount`) —
applied identically in posting, the cached balance, and reconciliation.

## Prerequisites

- [Docker Desktop](https://www.docker.com/) (running)
- Node.js 20+ and `pnpm` (`npm i -g pnpm`)

## Setup & run

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL (published on host port 5544 — see note below)
docker compose up -d

# 3. Generate the Prisma 7 client + apply the schema
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy

# 4. Seed accounts + a few realistic demo transactions
pnpm --filter api exec prisma db seed

# 5. Start the API (:3000) and the web app (:4200) together
pnpm dev
```

Then open **http://localhost:4200** and **sign in**.

### Sign in (seeded accounts, password `password123`)

| Email | Role | Can |
| --- | --- | --- |
| `admin@keepsake.local` | admin | everything (incl. user management + retention) |
| `accountant@keepsake.local` | accountant | post transactions + view/audit/reconcile/export |
| `auditor@keepsake.local` | auditor | view/audit/reconcile/verify/export (no posting) |
| `viewer@keepsake.local` | viewer | view ledger only |

The app now has **auth + 4-role RBAC**, a **tamper-evident hash-chained audit** (with a live
integrity badge and `/audit/verify`), **four-check reconciliation**, **point-in-time recovery +
self-verifying export**, and **audit retention/archival**. See `BUILD.md` → *Full-Product Extension*
for the design and the offline verifier scripts (`scripts/verify-export.ts`, `scripts/verify-chain.ts`).

> **Port note:** Postgres is published on host port **5544** (not the default 5432) because a native
> Windows PostgreSQL service already occupies 5432 on the dev machine. The connection string lives in
> `.env` and `apps/api/.env`; Prisma 7 reads it via `prisma.config.ts`, and the app connects through
> the pg driver adapter at runtime.
>
> **Prisma 7 note:** the generated client lives in `apps/api/src/generated/prisma` (gitignored) and is
> imported from there — not from `@prisma/client`. `prisma migrate reset` does **not** auto-run the
> seed in v7, so run `prisma db seed` separately after a reset.
>
> **Angular note:** the web app is on Angular 19 (the latest CLI requires a newer Node minor than this
> machine has); everything the spec needs — standalone components, signals, `provideHttpClient` — is fully supported.

### Useful commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the API and web app together (Turbo, persistent) |
| `pnpm --filter api start:dev` | API only, watch mode (:3000) |
| `pnpm --filter web start` | Web only (:4200) |
| `pnpm --filter api exec prisma studio` | Browse the database |
| `pnpm --filter api exec prisma migrate reset --force && pnpm --filter api exec prisma db seed` | Rebuild + reseed |

## API

| Method & path | Description |
| --- | --- |
| `POST /transactions` | Post a balanced transaction (atomic, audited). `400` if unbalanced / invalid / has unknown fields. |
| `GET /accounts` | All accounts with cached balances |
| `GET /transactions` | Transactions (newest first) with their entries |
| `GET /audit` | Append-only audit trail (newest first) |
| `GET /reconcile` | Per-account cached vs. derived balance + `allInAgreement` |

Example post:

```bash
curl -X POST http://localhost:3000/transactions \
  -H 'Content-Type: application/json' \
  -d '{"description":"Cash sale","entries":[
        {"accountId":"<CASH_ID>","direction":"debit","amount":1000},
        {"accountId":"<REVENUE_ID>","direction":"credit","amount":1000}]}'
```

## Demo script

1. **Post a balanced transaction** (Post tab): pick two accounts, set equal debit/credit amounts —
   the indicator turns **Balanced ✓** — and submit. TanStack Query invalidates the reads, so it
   immediately appears in the **Ledger**.
2. **Try an unbalanced one**: make debits ≠ credits. The indicator shows **Unbalanced ✗** and posting
   is blocked — nothing is written (the API also rejects it with `400`).
3. **Audit tab**: every accepted transaction has exactly one immutable audit row; rejected attempts
   leave none.
4. **Reconciliation**: shows **all accounts in agreement** — cached balances match the entries.
5. **Catch tampering**: corrupt a balance directly in the DB and reconcile again:
   ```bash
   docker exec keepsake-postgres psql -U keepsake -d keepsake \
     -c "UPDATE \"Account\" SET balance = balance + 500 WHERE name='Cash';"
   ```
   Reconciliation now flags Cash as a mismatch (`difference = 500`, `allInAgreement = false`).
   Restore it by subtracting 500.

## Project layout

```
keepsake/
├─ apps/
│  ├─ api/                         NestJS + Prisma 7
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma          Account · Transaction · Entry · AuditLog
│  │  │  └─ seed.ts                3 accounts + demo transactions
│  │  ├─ prisma.config.ts          Prisma 7 config (schema, migrations, seed, datasource url)
│  │  └─ src/
│  │     ├─ main.ts                global ValidationPipe + HttpExceptionFilter + CORS
│  │     ├─ generated/prisma/      generated Prisma client (gitignored)
│  │     ├─ prisma/                PrismaService (the only PrismaClient) + PrismaModule
│  │     ├─ common/filters/        global HTTP exception filter
│  │     └─ modules/ledger/        controller · service · repository (Prisma only) · mapper · dto/
│  └─ web/                         Angular 19 + Tailwind v4 + TanStack Query
│     └─ src/app/
│        ├─ app.config.ts          provideHttpClient + provideTanStackQuery
│        ├─ core/
│        │  ├─ api/ledger.api.ts    HttpClient calls + query keys
│        │  └─ models/              TS interfaces mirroring the API DTOs
│        ├─ state/ui.store.ts       Angular signals (form rows + live balanced flag)
│        └─ features/               post-transaction · ledger · audit-reconcile
├─ docker-compose.yml               postgres:16-alpine (host port 5544)
├─ turbo.json
└─ pnpm-workspace.yaml
```
