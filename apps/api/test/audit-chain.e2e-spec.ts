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
import { computeHash } from '../src/common/crypto/audit-hash';

describe('Hash-chained audit (tamper-evident)', () => {
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
  const post = (amount: number) =>
    request(server()).post('/transactions').set(auth(token)).send(balancedBody(cash, rev, amount));
  const verify = () => request(server()).get('/audit/verify').set(auth(token));

  it('each posted row links to the previous and its hash recomputes; /audit/verify valid', async () => {
    await post(100).expect(201);
    await post(200).expect(201);
    await post(300).expect(201);

    const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
    expect(rows).toHaveLength(3);
    expect(rows[0].prevHash).toBeNull();
    expect(rows[1].prevHash).toBe(rows[0].hash);
    expect(rows[2].prevHash).toBe(rows[1].hash);

    rows.forEach((r, i) => {
      const expected = computeHash(
        {
          seq: r.seq.toString(),
          entity: r.entity,
          entityId: r.entityId,
          action: r.action,
          actorId: r.actorId,
          createdAt: r.createdAt.toISOString(),
          snapshot: r.snapshot,
        },
        i === 0 ? null : rows[i - 1].hash,
      );
      expect(r.hash).toBe(expected);
    });

    const v = await verify().expect(200);
    expect(v.body).toEqual({ valid: true, brokenAtSeq: null, checked: 3 });
  });

  it('actorId on each audit row matches the authenticated poster', async () => {
    await post(100).expect(201);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@keepsake.local' },
    });
    const row = await prisma.auditLog.findFirstOrThrow({ orderBy: { seq: 'desc' } });
    expect(row.actorId).toBe(admin.id);
  });

  it('SQL tamper is caught at the exact seq, and restore re-verifies', async () => {
    await post(100).expect(201);
    await post(200).expect(201);
    await post(300).expect(201);

    await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action='tampered' WHERE seq=2`);
    const broken = await verify().expect(200);
    expect(broken.body.valid).toBe(false);
    expect(broken.body.brokenAtSeq).toBe('2');

    await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action='created' WHERE seq=2`);
    const fixed = await verify().expect(200);
    expect(fixed.body.valid).toBe(true);
  });

  it('concurrent posts get distinct sequential seq and the chain stays valid', async () => {
    const N = 10;
    // Disjoint account pairs so ONLY the advisory head-lock serializes the audit append.
    const names = Array.from({ length: N * 2 }, (_, i) => `Acc${i}`);
    await prisma.account.createMany({ data: names.map((name) => ({ name })) });
    const accts = await prisma.account.findMany({ where: { name: { in: names } } });
    const byName = new Map(accts.map((a) => [a.name, a.id]));

    const bodies = Array.from({ length: N }, (_, i) => ({
      description: `concurrent ${i}`,
      entries: [
        { accountId: byName.get(`Acc${2 * i}`), direction: 'debit', amount: 100 },
        { accountId: byName.get(`Acc${2 * i + 1}`), direction: 'credit', amount: 100 },
      ],
    }));

    const results = await Promise.all(
      bodies.map((b) => request(server()).post('/transactions').set(auth(token)).send(b)),
    );
    results.forEach((r) => expect(r.status).toBe(201));

    const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
    expect(rows).toHaveLength(N);
    const seqs = rows.map((r) => Number(r.seq));
    expect(new Set(seqs).size).toBe(N); // distinct
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1)); // sequential 1..N

    const v = await verify().expect(200);
    expect(v.body.valid).toBe(true);
    expect(v.body.checked).toBe(N);
  });
});
