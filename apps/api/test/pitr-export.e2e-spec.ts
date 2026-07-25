import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/test-app';
import {
  accountId,
  auth,
  balancedBody,
  login,
  resetDb,
} from './setup/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';
import { stableStringify } from '../src/common/crypto/audit-hash';

const API_ROOT = path.resolve(__dirname, '..');

describe('Point-in-time recovery & verifiable export', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let cash: string;
  let rev: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    token = await login(app, 'admin@keepsake.local');
    cash = await accountId(prisma, 'Cash');
    rev = await accountId(prisma, 'Revenue');
  });

  const server = () => app.getHttpServer();
  const get = (p: string) => request(server()).get(p).set(auth(token));

  it('as-of a middle instant excludes later transactions', async () => {
    // Two posts, then backdate their transaction+entry timestamps to known instants.
    await request(server()).post('/transactions').set(auth(token)).send(balancedBody(cash, rev, 1000)).expect(201);
    await request(server()).post('/transactions').set(auth(token)).send(balancedBody(cash, rev, 2000)).expect(201);
    const [t1, t2] = await prisma.transaction.findMany({ orderBy: { createdAt: 'asc' } });

    const early = '2020-01-01T00:00:00.000Z';
    const late = '2020-06-01T00:00:00.000Z';
    for (const [id, when] of [
      [t1.id, early],
      [t2.id, late],
    ] as const) {
      await prisma.$executeRawUnsafe(`UPDATE "Transaction" SET "createdAt" = '${when}' WHERE id = '${id}'`);
      await prisma.$executeRawUnsafe(`UPDATE "Entry" SET "createdAt" = '${when}' WHERE "transactionId" = '${id}'`);
    }

    // as-of a middle instant → only the first (Cash +1000) counts.
    const asOf = await get('/accounts/as-of?at=2020-03-01T00:00:00.000Z').expect(200);
    const asOfCash = asOf.body.find((a: { name: string }) => a.name === 'Cash');
    expect(asOfCash.balance).toBe(1000);

    // current cached balance includes both.
    const current = await get('/accounts').expect(200);
    const curCash = current.body.find((a: { name: string }) => a.name === 'Cash');
    expect(curCash.balance).toBe(3000);

    const asOfTxns = await get('/transactions/as-of?at=2020-03-01T00:00:00.000Z').expect(200);
    expect(asOfTxns.body).toHaveLength(1);
    expect(asOfTxns.body[0].id).toBe(t1.id);
  });

  it('export is self-verifying: verify-export passes on a good doc and fails on a one-byte change', async () => {
    await request(server()).post('/transactions').set(auth(token)).send(balancedBody(cash, rev, 1000)).expect(201);
    await request(server()).post('/transactions').set(auth(token)).send(balancedBody(cash, rev, 2000)).expect(201);

    const res = await get('/export?at=2030-01-01T00:00:00.000Z').expect(200);
    const doc = res.body;

    // exportHash matches canonical(document minus exportHash)
    const { exportHash, ...rest } = doc;
    const recomputed = createHash('sha256').update(stableStringify(rest)).digest('hex');
    expect(recomputed).toBe(exportHash);
    expect(doc.audit.length).toBeGreaterThanOrEqual(2);

    const file = path.join(API_ROOT, 'tmp-export.test.json');
    const run = () =>
      execSync('pnpm exec tsx scripts/verify-export.ts tmp-export.test.json', {
        cwd: API_ROOT,
        stdio: 'pipe',
      });

    try {
      // Good export -> verifier exits 0 (no throw).
      writeFileSync(file, JSON.stringify(doc));
      expect(() => run()).not.toThrow();

      // One-byte change -> verifier exits non-zero (throws).
      doc.accounts[0].balance += 1;
      writeFileSync(file, JSON.stringify(doc));
      expect(() => run()).toThrow();
    } finally {
      unlinkSync(file);
    }
  });
});
