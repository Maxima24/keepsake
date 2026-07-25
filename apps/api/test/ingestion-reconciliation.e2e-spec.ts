import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './setup/test-app';
import { resetDb, login, auth } from './setup/fixtures';

const BANK_MAPPING = {
  hasHeader: true,
  delimiter: ',',
  columns: {
    reference: 'REF',
    amount: { column: 'AMT', scale: 100 },
    direction: { column: 'TYPE', map: { C: 'credit', D: 'debit' } },
    valueDate: { column: 'DATE', format: 'YYYY-MM-DD' },
  },
};

describe('Ingestion & Reconciliation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    adminToken = await login(app, 'admin@keepsake.local');
  });

  const server = () => app.getHttpServer();

  async function mintKey(label = 'sdk'): Promise<string> {
    const res = await request(server())
      .post('/api-keys')
      .set(auth(adminToken))
      .send({ label })
      .expect(201);
    return res.body.key as string;
  }

  const txnBody = (over: Record<string, unknown> = {}) => ({
    source: 'core-ledger',
    externalId: 'txn_1',
    occurredAt: '2026-03-03T10:00:00.000Z',
    reference: 'R1',
    entries: [
      { account: 'Cash', direction: 'debit', amount: 1000 },
      { account: 'Revenue', direction: 'credit', amount: 1000 },
    ],
    ...over,
  });

  it('ingests via an API key, posts to the ledger, and is idempotent by externalId', async () => {
    const key = await mintKey();

    const first = await request(server())
      .post('/ingest/transactions')
      .set('X-API-Key', key)
      .send(txnBody())
      .expect(200);
    expect(first.body).toMatchObject({ duplicate: false, needsMapping: false });
    expect(first.body.transactionId).toBeTruthy();
    expect(await prisma.transaction.count()).toBe(1);

    // Same externalId again → no second write.
    const again = await request(server())
      .post('/ingest/transactions')
      .set('X-API-Key', key)
      .send(txnBody())
      .expect(200);
    expect(again.body).toMatchObject({ duplicate: true, id: first.body.id });
    expect(await prisma.transaction.count()).toBe(1);
  });

  it('keeps a record but flags needsMapping when an account cannot be resolved', async () => {
    const key = await mintKey();
    const res = await request(server())
      .post('/ingest/transactions')
      .set('X-API-Key', key)
      .send(
        txnBody({
          externalId: 'txn_unmapped',
          entries: [
            { account: 'Nope', direction: 'debit', amount: 500 },
            { account: 'AlsoNope', direction: 'credit', amount: 500 },
          ],
        }),
      )
      .expect(200);
    expect(res.body).toMatchObject({ needsMapping: true, transactionId: null });
    // Recorded (never dropped), but nothing posted to the ledger.
    expect(await prisma.ingestedTransaction.count()).toBe(1);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it('rejects ingestion with no credentials and with a revoked key', async () => {
    await request(server())
      .post('/ingest/transactions')
      .send(txnBody())
      .expect(401);

    const mint = await request(server())
      .post('/api-keys')
      .set(auth(adminToken))
      .send({ label: 'temp' })
      .expect(201);
    await request(server())
      .delete(`/api-keys/${mint.body.id}`)
      .set(auth(adminToken))
      .expect(200);
    await request(server())
      .post('/ingest/transactions')
      .set('X-API-Key', mint.body.key)
      .send(txnBody())
      .expect(401);
  });

  it('imports a counterparty CSV (dedup by content hash) and reconciles a match', async () => {
    const key = await mintKey();

    // Source A: the ledger mirror.
    await request(server())
      .post('/ingest/transactions')
      .set('X-API-Key', key)
      .send(txnBody())
      .expect(200);

    // Source B: register + map + upload.
    const source = await request(server())
      .post('/sources')
      .set(auth(adminToken))
      .send({ name: 'access-bank', kind: 'counterparty' })
      .expect(201);
    await request(server())
      .post(`/sources/${source.body.id}/mapping`)
      .set(auth(adminToken))
      .send({ mapping: BANK_MAPPING })
      .expect(201);

    const csv = 'REF,AMT,TYPE,DATE\nR1,10.00,D,2026-03-03\n';
    const up = await request(server())
      .post('/ingest/files')
      .set('X-API-Key', key)
      .field('sourceName', 'access-bank')
      .attach('file', Buffer.from(csv), 'bank.csv')
      .expect(201);
    expect(up.body).toMatchObject({ rowCount: 1, errorCount: 0, duplicate: false });

    // Same bytes again → deduped.
    const dup = await request(server())
      .post('/ingest/files')
      .set('X-API-Key', key)
      .field('sourceName', 'access-bank')
      .attach('file', Buffer.from(csv), 'bank.csv')
      .expect(201);
    expect(dup.body.duplicate).toBe(true);
    expect(await prisma.counterpartyRecord.count()).toBe(1);

    // L3: run reconciliation over the window.
    const run = await request(server())
      .post('/reconciliation/runs')
      .set(auth(adminToken))
      .send({
        sourceA: 'core-ledger',
        sourceB: 'access-bank',
        windowFrom: '2026-03-01T00:00:00.000Z',
        windowTo: '2026-03-31T23:59:59.000Z',
      })
      .expect(201);
    expect(run.body.summary.matched).toBe(1);
    expect(run.body.reconciled).toBe(true);
    expect(run.body.exportHash).toHaveLength(64);

    // The whole ingestion + matching pipeline stayed hash-chain verifiable.
    const verify = await request(server())
      .get('/audit/verify')
      .set(auth(adminToken))
      .expect(200);
    expect(verify.body.valid).toBe(true);
  });

  it('re-run auto-resolves a break once the missing counterparty side arrives', async () => {
    const key = await mintKey();
    await request(server())
      .post('/ingest/transactions')
      .set('X-API-Key', key)
      .send(txnBody())
      .expect(200);

    const source = await request(server())
      .post('/sources')
      .set(auth(adminToken))
      .send({ name: 'access-bank', kind: 'counterparty' })
      .expect(201);
    await request(server())
      .post(`/sources/${source.body.id}/mapping`)
      .set(auth(adminToken))
      .send({ mapping: BANK_MAPPING })
      .expect(201);

    const runBody = {
      sourceA: 'core-ledger',
      sourceB: 'access-bank',
      windowFrom: '2026-03-01T00:00:00.000Z',
      windowTo: '2026-03-31T23:59:59.000Z',
    };

    // First run: B is missing → a break.
    const before = await request(server())
      .post('/reconciliation/runs')
      .set(auth(adminToken))
      .send(runBody)
      .expect(201);
    expect(before.body.reconciled).toBe(false);
    expect(before.body.summary.unmatched_source_a).toBe(1);

    // B arrives.
    await request(server())
      .post('/ingest/files')
      .set('X-API-Key', key)
      .field('sourceName', 'access-bank')
      .attach('file', Buffer.from('REF,AMT,TYPE,DATE\nR1,10.00,D,2026-03-03\n'), 'bank.csv')
      .expect(201);

    // Re-run: the break self-heals.
    const after = await request(server())
      .post('/reconciliation/runs')
      .set(auth(adminToken))
      .send(runBody)
      .expect(201);
    expect(after.body.reconciled).toBe(true);
    expect(after.body.summary.matched).toBe(1);
  });
});
