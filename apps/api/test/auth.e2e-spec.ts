import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/test-app';
import { auth, login, resetDb, TEST_PASSWORD } from './setup/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth', () => {
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

  const server = () => app.getHttpServer();

  it('register issues a token and never returns passwordHash', async () => {
    const res = await request(server())
      .post('/auth/register')
      .send({ email: 'new.user@example.com', password: 'password123' })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('login returns a token; wrong password -> 401', async () => {
    const ok = await request(server())
      .post('/auth/login')
      .send({ email: 'admin@keepsake.local', password: TEST_PASSWORD })
      .expect(200);
    expect(ok.body.accessToken).toBeDefined();

    await request(server())
      .post('/auth/login')
      .send({ email: 'admin@keepsake.local', password: 'wrong-password' })
      .expect(401);
  });

  it('GET /auth/me returns the user (role) but never passwordHash', async () => {
    const token = await login(app, 'accountant@keepsake.local');
    const res = await request(server()).get('/auth/me').set(auth(token)).expect(200);
    expect(res.body.email).toBe('accountant@keepsake.local');
    expect(res.body.role).toBe('accountant');
    expect(res.body.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('protected route without a token -> 401', async () => {
    await request(server()).get('/auth/me').expect(401);
  });

  it('malformed token -> 401', async () => {
    await request(server())
      .get('/auth/me')
      .set({ Authorization: 'Bearer not-a-real-jwt' })
      .expect(401);
  });
});
