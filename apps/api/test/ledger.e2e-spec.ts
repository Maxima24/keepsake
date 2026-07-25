import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/test-app';
import {
  accountId,
  auth,
  balancedBody,
  countAll,
  login,
  resetDb,
} from './setup/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Ledger — atomic balanced posting (the correctness invariant)', () => {
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

  const post = (body: unknown) =>
    request(app.getHttpServer()).post('/transactions').set(auth(token)).send(body);

  it('balanced post -> 201 with exact DB delta and correct balance moves', async () => {
    const before = await countAll(prisma);
    const res = await post(balancedBody(cash, rev, 1000)).expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.entries).toHaveLength(2);

    const after = await countAll(prisma);
    expect(after.transactions - before.transactions).toBe(1);
    expect(after.entries - before.entries).toBe(2);
    expect(after.audit - before.audit).toBe(1);

    const cashAcc = await prisma.account.findUniqueOrThrow({ where: { id: cash } });
    const revAcc = await prisma.account.findUniqueOrThrow({ where: { id: rev } });
    expect(cashAcc.balance).toBe(1000); // debit +
    expect(revAcc.balance).toBe(-1000); // credit -
  });

  it('UNBALANCED post -> 400 and NOTHING is written (the leak test)', async () => {
    const before = await countAll(prisma);
    await post({
      description: 'bad',
      entries: [
        { accountId: cash, direction: 'debit', amount: 1000 },
        { accountId: rev, direction: 'credit', amount: 999 },
      ],
    }).expect(400);

    // Row counts across all tables are identical — nothing leaked.
    expect(await countAll(prisma)).toEqual(before);
    const cashAcc = await prisma.account.findUniqueOrThrow({ where: { id: cash } });
    expect(cashAcc.balance).toBe(0);
  });

  it('unknown accountId -> 400, no writes', async () => {
    const before = await countAll(prisma);
    await post({
      description: 'bad',
      entries: [
        { accountId: '00000000-0000-0000-0000-000000000000', direction: 'debit', amount: 500 },
        { accountId: rev, direction: 'credit', amount: 500 },
      ],
    }).expect(400);
    expect(await countAll(prisma)).toEqual(before);
  });

  it('non-positive amount -> 400, no writes', async () => {
    const before = await countAll(prisma);
    await post({
      description: 'bad',
      entries: [
        { accountId: cash, direction: 'debit', amount: -5 },
        { accountId: rev, direction: 'credit', amount: -5 },
      ],
    }).expect(400);
    expect(await countAll(prisma)).toEqual(before);
  });

  it('non-integer amount -> 400, no writes', async () => {
    const before = await countAll(prisma);
    await post({
      description: 'bad',
      entries: [
        { accountId: cash, direction: 'debit', amount: 1.5 },
        { accountId: rev, direction: 'credit', amount: 1.5 },
      ],
    }).expect(400);
    expect(await countAll(prisma)).toEqual(before);
  });

  it('fewer than 2 entries -> 400, no writes', async () => {
    const before = await countAll(prisma);
    await post({
      description: 'bad',
      entries: [{ accountId: cash, direction: 'debit', amount: 100 }],
    }).expect(400);
    expect(await countAll(prisma)).toEqual(before);
  });

  it('unknown extra property -> 400 (whitelist), no writes', async () => {
    const before = await countAll(prisma);
    await post({
      description: 'bad',
      evil: true,
      entries: [
        { accountId: cash, direction: 'debit', amount: 100 },
        { accountId: rev, direction: 'credit', amount: 100 },
      ],
    }).expect(400);
    expect(await countAll(prisma)).toEqual(before);
  });

  it('balance is a cache: cached balances equal the derived sums after several posts', async () => {
    await post(balancedBody(cash, rev, 1000)).expect(201);
    await post(balancedBody(cash, rev, 500)).expect(201);

    const grouped = await prisma.entry.groupBy({
      by: ['accountId', 'direction'],
      _sum: { amount: true },
    });
    const derived = new Map<string, number>();
    for (const g of grouped) {
      const s = g._sum.amount ?? 0;
      derived.set(
        g.accountId,
        (derived.get(g.accountId) ?? 0) + (g.direction === 'debit' ? s : -s),
      );
    }
    const accounts = await prisma.account.findMany();
    for (const a of accounts) {
      expect(a.balance).toBe(derived.get(a.id) ?? 0);
    }
  });
});
