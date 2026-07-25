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
import { ReconcileScheduler } from '../src/modules/ledger/reconcile.scheduler';

interface Check {
  key: string;
  pass: boolean;
  offending: string[];
}

describe('Reconciliation (four checks + chain)', () => {
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
    // Some real data to reconcile.
    await request(app.getHttpServer())
      .post('/transactions')
      .set(auth(token))
      .send(balancedBody(cash, rev, 1000))
      .expect(201);
    await request(app.getHttpServer())
      .post('/transactions')
      .set(auth(token))
      .send(balancedBody(cash, rev, 2000))
      .expect(201);
  });

  const reconcile = () => request(app.getHttpServer()).get('/reconcile').set(auth(token));
  const checkOf = (body: { checks: Check[] }, key: string) =>
    body.checks.find((c) => c.key === key)!;

  it('clean state -> all four checks pass', async () => {
    const r = await reconcile().expect(200);
    expect(r.body.allInAgreement).toBe(true);
    for (const k of ['balance_agreement', 'transaction_self_balance', 'no_orphans', 'chain_validity']) {
      expect(checkOf(r.body, k).pass).toBe(true);
    }
  });

  it('corrupt a cached balance -> only balance_agreement fails', async () => {
    await prisma.$executeRawUnsafe(`UPDATE "Account" SET balance = balance + 500 WHERE id = '${cash}'`);
    const r = await reconcile().expect(200);
    expect(checkOf(r.body, 'balance_agreement').pass).toBe(false);
    expect(checkOf(r.body, 'balance_agreement').offending).toContain(cash);
    expect(checkOf(r.body, 'transaction_self_balance').pass).toBe(true);
    expect(checkOf(r.body, 'no_orphans').pass).toBe(true);
    expect(checkOf(r.body, 'chain_validity').pass).toBe(true);
  });

  it('unbalance a transaction -> only transaction_self_balance fails', async () => {
    const tx = await prisma.transaction.findFirstOrThrow();
    // extra entry + matching cache bump so ONLY self-balance is affected
    await prisma.entry.create({
      data: { transactionId: tx.id, accountId: cash, direction: 'debit', amount: 500 },
    });
    await prisma.$executeRawUnsafe(`UPDATE "Account" SET balance = balance + 500 WHERE id = '${cash}'`);
    const r = await reconcile().expect(200);
    expect(checkOf(r.body, 'transaction_self_balance').pass).toBe(false);
    expect(checkOf(r.body, 'transaction_self_balance').offending).toContain(tx.id);
    expect(checkOf(r.body, 'balance_agreement').pass).toBe(true);
    expect(checkOf(r.body, 'no_orphans').pass).toBe(true);
    expect(checkOf(r.body, 'chain_validity').pass).toBe(true);
  });

  it('thin transaction (1 entry) -> no_orphans fails', async () => {
    const t = await prisma.transaction.create({ data: { description: 'orphan' } });
    await prisma.entry.create({
      data: { transactionId: t.id, accountId: cash, direction: 'debit', amount: 100 },
    });
    await prisma.$executeRawUnsafe(`UPDATE "Account" SET balance = balance + 100 WHERE id = '${cash}'`);
    const r = await reconcile().expect(200);
    expect(checkOf(r.body, 'no_orphans').pass).toBe(false);
    expect(checkOf(r.body, 'no_orphans').offending).toContain(t.id);
    expect(checkOf(r.body, 'balance_agreement').pass).toBe(true);
    expect(checkOf(r.body, 'chain_validity').pass).toBe(true);
  });

  it('tamper an audit row -> only chain_validity fails', async () => {
    await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action='tampered' WHERE seq=1`);
    const r = await reconcile().expect(200);
    expect(checkOf(r.body, 'chain_validity').pass).toBe(false);
    expect(checkOf(r.body, 'chain_validity').offending).toContain('1');
    expect(checkOf(r.body, 'balance_agreement').pass).toBe(true);
    expect(checkOf(r.body, 'transaction_self_balance').pass).toBe(true);
    expect(checkOf(r.body, 'no_orphans').pass).toBe(true);
  });

  it('scheduled job writes one reconcile_failed row on failure, none on pass', async () => {
    const scheduler = app.get(ReconcileScheduler);
    const countFailed = () =>
      prisma.auditLog.count({ where: { action: 'reconcile_failed' } });

    await scheduler.run();
    expect(await countFailed()).toBe(0); // clean -> silent

    await prisma.$executeRawUnsafe(`UPDATE "Account" SET balance = balance + 500 WHERE id = '${cash}'`);
    await scheduler.run();
    expect(await countFailed()).toBe(1); // failing -> exactly one

    await prisma.$executeRawUnsafe(`UPDATE "Account" SET balance = balance - 500 WHERE id = '${cash}'`);
    await scheduler.run();
    expect(await countFailed()).toBe(1); // restored -> no new
  });
});
