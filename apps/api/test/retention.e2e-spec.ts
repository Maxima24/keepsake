import { execSync } from 'node:child_process';
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

const API_ROOT = path.resolve(__dirname, '..');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Retention & verifiable archival', () => {
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

  it('archival copies-then-prunes; live chain verifies via checkpoint; archive is independently verifiable', async () => {
    await post(100).expect(201);
    await post(200).expect(201);
    await post(300).expect(201);

    // Archive everything so far (far-future cutoff).
    const res = await request(server())
      .post('/retention/archive?before=2030-01-01T00:00:00.000Z')
      .set(auth(token))
      .expect(201);
    expect(res.body.archived).toBe(3);
    const checkpointHash = res.body.checkpointHash as string;
    expect(checkpointHash).toMatch(/^[0-9a-f]{64}$/);

    // Live chain: just the checkpoint anchor now.
    const live = await prisma.auditLog.findMany();
    expect(live).toHaveLength(1);
    expect(live[0].action).toBe('checkpoint');
    expect(live[0].hash).toBe(checkpointHash);

    // /audit/verify still valid (via the checkpoint).
    expect((await verify().expect(200)).body.valid).toBe(true);

    // Archive holds the 3 originals and is independently verifiable.
    const arch = await request(server()).get('/audit/archive').set(auth(token)).expect(200);
    expect(arch.body).toHaveLength(3);

    const file = path.join(API_ROOT, 'tmp-archive.test.json');
    try {
      writeFileSync(file, JSON.stringify(arch.body));
      const out = execSync('pnpm exec tsx scripts/verify-chain.ts tmp-archive.test.json', {
        cwd: API_ROOT,
        stdio: 'pipe',
      }).toString();
      const parsed = JSON.parse(out.trim().split('\n').pop()!);
      expect(parsed.valid).toBe(true);
      expect(parsed.headHash).toBe(checkpointHash); // continuity: archive head == live checkpoint
    } finally {
      unlinkSync(file);
    }

    // New activity continues verifiably after the checkpoint.
    await post(400).expect(201);
    expect((await verify().expect(200)).body.valid).toBe(true);
  });

  it('archival REFUSES and rolls back if it would leave a broken live chain', async () => {
    await post(100).expect(201);
    await sleep(40);
    await post(200).expect(201);
    await sleep(40);
    await post(300).expect(201);

    const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
    const seq2CreatedAt = rows[1].createdAt.toISOString();

    // Tamper the newest row (seq 3) — it will remain live after archiving seq 1-2.
    await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action='tampered' WHERE seq=3`);

    // Attempt to archive seq 1-2 → resulting live chain (checkpoint + tampered seq 3) is invalid → refuse.
    const res = await request(server())
      .post(`/retention/archive?before=${encodeURIComponent(seq2CreatedAt)}`)
      .set(auth(token));
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Rolled back: nothing archived, all 3 rows still live, no checkpoint added.
    expect(await prisma.auditArchive.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(3);
    expect(
      await prisma.auditLog.count({ where: { action: 'checkpoint' } }),
    ).toBe(0);
  });

  it('a retention policy change is audited with the actor', async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@keepsake.local' },
    });
    await request(server())
      .put('/retention')
      .set(auth(token))
      .send({ auditRetentionDays: 30 })
      .expect(200);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'retention' },
      orderBy: { seq: 'desc' },
    });
    expect(row.action).toBe('retention_updated');
    expect(row.actorId).toBe(admin.id);
    expect((await verify().expect(200)).body.valid).toBe(true);
  });
});
