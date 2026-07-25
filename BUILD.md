# Keepsake — Build Report

An honest record of what was actually built and verified, the architecture, how the
hard invariants are enforced in code, and where reality deviated from the spec.

---

## 1. What it is

An auditable **double-entry ledger**:

- Transactions are **balanced by construction** (debits must equal credits) and written **atomically**.
- Every accepted change lands in an **append-only audit trail**.
- A **reconciliation** endpoint proves cached balances agree with the underlying entries, and
  catches tampering.

Monorepo: a NestJS + Prisma 7 API and an Angular 19 web app, run together with Turborepo/pnpm.

---

## 2. Stack (as actually installed)

| Layer | Choice | Version |
| --- | --- | --- |
| Monorepo | Turborepo · pnpm | turbo 2.10 · pnpm 9.15.9 |
| Runtime | Node.js | 24.2.0 |
| API | NestJS | 11 |
| ORM | Prisma (`prisma-client` generator) | 7.9.0 |
| DB driver | `@prisma/adapter-pg` + `pg` | 7.9.0 / 8.22 |
| Database | PostgreSQL (Docker) | 16-alpine |
| Web | Angular (standalone) | 19.2 |
| Styling | Tailwind CSS | 4.3 |
| Server state | `@tanstack/angular-query-experimental` | 5.101 |
| UI state | Angular signals | — |
| Validation | class-validator / class-transformer | 0.15 / 0.5 |

---

## 3. Repository layout (actual)

```
keepsake/
├─ apps/
│  ├─ api/                              NestJS + Prisma 7
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma               4 models; generator=prisma-client, moduleFormat=cjs
│  │  │  └─ seed.ts                     3 accounts + 4 demo transactions (atomic, audited)
│  │  ├─ prisma.config.ts               schema · migrations · seed · datasource url (Prisma 7)
│  │  └─ src/
│  │     ├─ main.ts                     dotenv · ValidationPipe · HttpExceptionFilter · CORS
│  │     ├─ app.module.ts               imports PrismaModule + LedgerModule
│  │     ├─ generated/prisma/           generated client (gitignored)
│  │     ├─ prisma/
│  │     │  ├─ prisma.service.ts        the ONLY PrismaClient (+ pg adapter)
│  │     │  └─ prisma.module.ts         @Global, exports PrismaService
│  │     ├─ common/filters/
│  │     │  └─ http-exception.filter.ts global @Catch() → consistent JSON error shape
│  │     └─ modules/ledger/
│  │        ├─ ledger.module.ts
│  │        ├─ ledger.controller.ts     HTTP only; returns DTOs
│  │        ├─ ledger.service.ts        orchestration + mapping + reconcile logic
│  │        ├─ ledger.repository.ts     the ONLY file importing Prisma; $transaction lives here
│  │        ├─ ledger.mapper.ts         pure Prisma-row → DTO (Date → ISO); no Prisma import
│  │        └─ dto/
│  │           ├─ create-transaction.dto.ts   class-validator input
│  │           ├─ account.dto.ts
│  │           ├─ transaction.dto.ts
│  │           ├─ audit.dto.ts
│  │           └─ reconcile.dto.ts
│  └─ web/                              Angular 19 + Tailwind v4 + TanStack Query
│     ├─ .postcssrc.json                @tailwindcss/postcss
│     └─ src/
│        ├─ styles.css                  @import "tailwindcss"
│        └─ app/
│           ├─ app.config.ts            provideHttpClient + provideTanStackQuery
│           ├─ app.routes.ts            /post · /ledger · /audit
│           ├─ app.component.{ts,html}  nav shell
│           ├─ core/
│           │  ├─ format.ts             formatMinor · formatDateTime
│           │  ├─ models/ledger.models.ts   interfaces mirroring the DTOs
│           │  └─ api/ledger.api.ts     HttpClient calls + shared QueryKeys
│           ├─ state/ui.store.ts        signals: form rows + computed balanced/canSubmit
│           └─ features/
│              ├─ post-transaction/     the demo screen
│              ├─ ledger/               balances + transaction history
│              └─ audit-reconcile/      audit table + reconciliation status
├─ docker-compose.yml                   postgres:16-alpine, host port 5544, healthcheck, volume
├─ turbo.json                           build · dev · lint · typecheck
├─ pnpm-workspace.yaml                  apps/* · packages/*
├─ .env                                 DATABASE_URL (…localhost:5544/keepsake)
└─ README.md
```

---

## 4. Data model

```prisma
model Account     { id, name @unique, balance Int @default(0), createdAt, entries[] }
model Transaction { id, description, createdAt, entries[] }
model Entry       { id, transactionId, accountId, direction String, amount Int, createdAt,
                    @@index([accountId]) @@index([transactionId]) }
model AuditLog    { id, entity, entityId, action, snapshot Json, createdAt, @@index([createdAt]) }
```

- **Money is integer minor units** (e.g. cents). `amount` is always positive; direction sets the sign.
- **Balance convention:** `debit → +amount`, `credit → -amount` — applied identically in posting,
  the cached `Account.balance`, and reconciliation.

---

## 5. API

| Method / path | Returns | Notes |
| --- | --- | --- |
| `POST /transactions` | `TransactionDto` | `201` on success; `400` if unbalanced, unknown account, non-positive amount, `< 2` entries, or **unknown fields** |
| `GET /accounts` | `AccountDto[]` | cached balances |
| `GET /transactions` | `TransactionDto[]` | newest first, with entries |
| `GET /audit` | `AuditDto[]` | append-only, newest first |
| `GET /reconcile` | `ReconcileResultDto` | per-account cached vs derived + `allInAgreement` |

**The atomic post flow** — all inside one `prisma.$transaction()` in `ledger.repository.ts`, in order:

1. Validate (before any write): `≥ 2` entries, every `amount > 0` integer, `sum(debits) === sum(credits)`,
   every `accountId` exists → else `BadRequestException` (rolls back, nothing persisted).
2. Create the `Transaction`.
3. `createMany` the `Entry` rows.
4. Update each `Account.balance` (`increment` by the signed amount).
5. Create the `AuditLog` row (`action: 'created'`, `snapshot`: the full transaction + entries).
6. Return the full transaction → the service maps it to `TransactionDto`.

---

## 6. How the hard invariants are enforced

| Invariant | Where / how |
| --- | --- |
| **Atomic balanced writes** | Single `this.prisma.$transaction()` in `ledger.repository.ts`; validation is step 1, before any write. Balanced/unknown-account failures throw inside the tx → full rollback. |
| **Append-only audit** | `AuditLog` is only ever `create`d — there is no update/delete path in repository, service, or controller. |
| **Balance is a cache** | `reconcile()` derives truth from entries via `entry.groupBy` and compares to the cached column; the cache is never treated as source of truth there. |
| **Money is integers** | `amount: Int` in schema; DTO uses `@IsInt() @Min(1)`; repository re-checks `Number.isInteger && > 0`. No floats anywhere. |
| **Layering** | `grep` confirms Prisma/`PrismaService` is imported only in `ledger.repository.ts`; the generated client only in `prisma.service.ts`. Mapper uses structural row types (no Prisma import) and converts `Date → ISO string`; controllers return DTOs only. |
| **No scope creep** | No auth, users, roles, tenancy, or payments. |

Global `main.ts`: `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`,
the global `HttpExceptionFilter`, and CORS for `http://localhost:4200`.

---

## 7. Frontend architecture

- **Server state = TanStack Query.** `core/api/ledger.api.ts` wraps `HttpClient` (typed to the models) and
  exports shared `QueryKeys`. Reads use `injectQuery`; the post uses `injectMutation` and, on success,
  invalidates `accounts` / `transactions` / `audit` / `reconcile` so every view refreshes.
- **UI state = Angular signals.** `state/ui.store.ts` holds the draft form rows and derives
  `debitTotal` / `creditTotal` / `balanced` / `canSubmit` as `computed` signals — that's the live
  **Balanced ✓ / Unbalanced ✗** indicator. No reactive forms, no Zustand.
- **Three standalone feature views:** Post Transaction (the demo screen), Ledger, Audit & Reconciliation.
- **Tailwind v4** via `@tailwindcss/postcss` + `@import "tailwindcss"`; utilities used directly in templates.

---

## 8. Verification performed

**Backend (curl + psql, against the running API):**

- Balanced post → `201` + a well-shaped `TransactionDto`; DB delta exactly `+1` transaction, `+2` entries,
  `+1` audit row, and the two balance changes.
- Unbalanced, unknown `accountId`, negative amount, and **unknown property** all → `400` with the DB
  snapshot **unchanged** (nothing leaked).
- `reconcile` → `allInAgreement: true`; corrupting a balance via SQL flips that account to
  `inAgreement: false` with the correct `difference`, and back to `true` after restore.
- `grep` confirmed Prisma is imported only in `ledger.repository.ts`.

**Frontend (headless Microsoft Edge via puppeteer-core, 13/13 checks):**

- App loads; accounts populate the dropdowns.
- Live indicator flips **Balanced ✓ / Unbalanced ✗**; submit is disabled while unbalanced.
- A balanced post via the TanStack mutation succeeds; the Ledger reflects it (query invalidation).
- Reconciliation view shows all accounts in agreement; audit table is populated.
- No uncaught page errors and no console errors.

Final state: DB reset to the curated seed (3 accounts + 4 demo transactions), reconciliation green.

---

## 9. Deviations from the spec (and why)

- **DB on host port 5544, not 5432.** A native Windows PostgreSQL service already owns IPv4 `:5432`,
  so Docker only got the IPv6 bind and `localhost:5432` resolved to the wrong database. Publishing on
  5544 avoids the collision without touching the user's Postgres.
- **Angular 19, not latest.** The latest Angular CLI requires Node ≥ 24.15; this machine runs Node 24.2,
  so `@angular/cli@latest new` aborts. Angular 19 only warns and works, and supports everything the spec
  needs (standalone, signals, `provideHttpClient`).
- **Prisma 7 specifics that differ from the brief's literal snippet** (followed actual v7 behavior, per the
  brief's own "check the installed version" guardrail):
  - The datasource `url` lives in `prisma.config.ts`, **not** in `schema.prisma` (v7 removed it from the schema).
  - `moduleFormat = "cjs"` is set on the generator so the CommonJS NestJS app can `require` the client.
  - `prisma migrate reset` does **not** auto-run the seed in v7 → `prisma db seed` is a separate step.

---

## 10. Not done / known gaps

- **No committed automated tests.** Behaviour was verified with throwaway curl/psql/puppeteer scripts,
  not a checked-in suite. The highest-value follow-up is a NestJS e2e suite locking in the invariants
  (atomic rollback, append-only audit, reconciliation catches tampering).
- **Not a git repository yet.** No commits have been made.
- **Frontend loading/error states are minimal** — TanStack Query exposes `isPending`/`isError`, but the
  views mostly render once data arrives.

---

## 11. Run it

```bash
pnpm install
docker compose up -d
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma db seed
pnpm dev            # API on :3000, web on :4200
```

Open **http://localhost:4200**. See `README.md` for the full demo script.

---

# Keepsake — Full-Product Extension

Built on top of the MVP above: authentication, RBAC, a tamper-evident hash-chained
audit, richer reconciliation, point-in-time recovery + verifiable export, and audit
retention. Single-org, integrity computed in-app (Node + Postgres), no Rust.

## New models

- `User { id, email @unique, passwordHash, role (Role enum), disabled, createdAt }`
- `Role` enum: `admin | accountant | auditor | viewer`
- `AuditLog` gained `seq BigInt @unique`, `actorId (FK User)`, `prevHash`, `hash @unique`
- `RetentionPolicy { id='default', auditRetentionDays, updatedAt, updatedBy }` (single row)
- `AuditArchive` — copies of pruned audit rows (with original hashes) for offline verification

## New endpoints (all require a JWT; `@Roles` per the matrix)

| Endpoint | Roles | Purpose |
| --- | --- | --- |
| `POST /auth/register`, `POST /auth/login` | public | `{ accessToken }` (argon2 + JWT) |
| `GET /auth/me` | any | current `UserDto` (never the hash) |
| `GET /users`, `PATCH /users/:id/role`, `PATCH /users/:id/disable` | admin | user management (audited) |
| `GET /audit`, `GET /audit/verify`, `GET /audit/archive` | admin·accountant·auditor | trail, chain verify, archive |
| `GET /reconcile` | admin·accountant·auditor | 4-check integrity report |
| `GET /accounts/as-of`, `GET /transactions/as-of`, `GET /export` | admin·accountant·auditor | point-in-time + export |
| `GET/PUT /retention`, `POST /retention/archive` | admin | retention policy + archival |

## Roles matrix (enforced by `JwtAuthGuard` → `RolesGuard`, default-deny)

| Capability | admin | accountant | auditor | viewer |
| --- | :-: | :-: | :-: | :-: |
| Post transactions | ✓ | ✓ | | |
| View ledger / accounts / transactions | ✓ | ✓ | ✓ | ✓ |
| View audit / reconcile / verify integrity | ✓ | ✓ | ✓ | |
| Point-in-time query / export | ✓ | ✓ | ✓ | |
| Manage users / roles / retention | ✓ | | | |

## Tamper-evident hash chain (the product's soul)

- **One canonicalization** (`common/crypto/audit-hash.ts`): `stableStringify` (recursively
  key-sorted, so JSONB reordering can't change a hash) over `{ seq, entity, entityId, action,
  actorId, createdAt, snapshot }`, then `hash = sha256(canonical + (prevHash ?? "GENESIS"))`.
  Used identically in posting, verifying, and exporting.
- **Append** (`AuditRepository.appendInTx`) runs INSIDE the same `$transaction` as the audited
  action, takes a Postgres **advisory lock** to serialize, reads the head, computes `seq`/`prevHash`,
  and inserts. Every mutation (transaction post, role change, disable, retention update) is chained
  and carries the authenticated `actorId`.
- **Verify** (`GET /audit/verify`) walks by `seq`, recomputes each hash, checks the link. A one-off
  `prisma/backfill-audit.ts` chained the legacy pre-chain rows.

## Richer reconciliation (`GET /reconcile`)

Four independent checks, each with offending ids: (1) cached balance == derived sum of entries,
(2) every transaction self-balances in the DB, (3) no orphaned entries / thin transactions,
(4) audit chain valid. A `@nestjs/schedule` job runs the full report on an interval and writes a
single `reconcile_failed` audit row on failure (silent on pass).

## Point-in-time & verifiable export

`accounts/as-of` and `transactions/as-of` derive state from entries `createdAt <= at`. `GET /export`
returns as-of state **plus the audit chain up to `at`** and an `exportHash` over the whole document.
`scripts/verify-export.ts` re-verifies the chain + `exportHash` **with no DB access** — the export is
self-verifying. Altering one byte fails verification.

## Retention & verifiable archival

Admin sets `auditRetentionDays` (null/0 = retain everything; safe by default). Archival copies old
rows to `AuditArchive` **before** pruning, then writes a **checkpoint** row into the live chain whose
`hash` equals the last archived hash — so the oldest live row still links to it. `verifyChain` is
checkpoint-aware, and the transaction **verifies the resulting live chain and rolls back if it would
break** verifiability. The archived prefix is independently verifiable via `scripts/verify-chain.ts`
(its head hash equals the live checkpoint's hash — continuity).

## Frontend additions (Angular 19 · Tailwind v4 · TanStack Query · signals)

- Login screen + `AuthStore` (signals), a functional token interceptor (attaches the bearer, routes
  to `/login` on 401), an `APP_INITIALIZER` that loads `me`, and `authGuard`/`roleGuard` route guards.
- **Role-gated nav** with a live **integrity badge** (green Verified / red Broken-at-#N).
- **Audit & Integrity** view (4 checks + chain badge + audit trail with seq/actor/hash), **Point-in-time**
  view (as-of picker + export download), **Admin** view (users role/disable + retention policy/archival).

## New deviations (and why)

- **Prisma 7 `migrate reset` does not auto-run the seed** and `migrate dev` blocks non-interactively
  on unique-constraint warnings — the `audit_chain` migration was hand-authored and applied with
  `migrate deploy`.
- **`RECONCILE_INTERVAL_MS`** env var makes the scheduler interval configurable (fast for tests).
- The `RolesGuard` is **default-deny**: a non-public route with no `@Roles` is admin-only.

## Verification performed (extension)

Curl/psql suites (all green): auth (register/login/me, no hash leak), the full RBAC matrix
(one allowed + one denied per role), hash-chain (link + verify + **tamper caught at exact seq** +
concurrent appends stay valid + actor attribution), reconciliation (4 checks each detect their
failure class + scheduler writes-on-failure/silent-on-pass), PITR/export (as-of excludes later txns,
export self-verifies, tamper detected), retention (audited policy, archival keeps live chain valid via
checkpoint, archive independently verifiable). Headless-Edge UI suite (14/14): unauthenticated
redirect, exact per-role nav, integrity badge Verified→Broken→Verified on live tamper, four checks,
as-of, export, admin screens, no console errors.

## Known gaps (unchanged intent)

Still no committed automated test suite (behaviour proven by throwaway scripts) and not yet a git
repo. Not in scope by design: multi-tenancy, Rust integrity, payment processing.
