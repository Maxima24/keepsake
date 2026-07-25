import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/test-app';
import { resetDb } from './setup/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

describe('smoke (test DB isolation)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  it('is connected to the dedicated test database', () => {
    expect(process.env.DATABASE_URL).toContain('keepsake_test');
  });

  it('GET /auth/me without a token -> 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('base fixtures are seeded (3 accounts, 4 users)', async () => {
    expect(await prisma.account.count()).toBe(3);
    expect(await prisma.user.count()).toBe(4);
    expect(await prisma.transaction.count()).toBe(0);
  });
});
