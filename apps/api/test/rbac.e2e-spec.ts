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
import { Role } from '../src/common/roles';

describe('RBAC matrix', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<Role, string> = {} as Record<Role, string>;
  let cash: string;
  let rev: string;
  let targetUserId: string;

  const roles: Role[] = ['admin', 'accountant', 'auditor', 'viewer'];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    for (const r of roles) tokens[r] = await login(app, `${r}@keepsake.local`);
    cash = await accountId(prisma, 'Cash');
    rev = await accountId(prisma, 'Revenue');
    targetUserId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'viewer@keepsake.local' },
      })
    ).id;
  });

  const server = () => app.getHttpServer();
  const code = (role: Role, m: 'get' | 'post' | 'patch', path: string, body?: unknown) =>
    request(server())[m](path).set(auth(tokens[role])).send(body ?? {});

  describe('POST /transactions — admin & accountant only', () => {
    it.each([
      ['admin', 201],
      ['accountant', 201],
      ['auditor', 403],
      ['viewer', 403],
    ] as [Role, number][])('%s -> %d', async (role, status) => {
      await code(role, 'post', '/transactions', balancedBody(cash, rev, 100)).expect(status);
    });
  });

  describe('GET /accounts — all roles', () => {
    it.each(roles)('%s -> 200', async (role) => {
      await code(role, 'get', '/accounts').expect(200);
    });
  });

  describe('GET /audit — admin, accountant, auditor (not viewer)', () => {
    it.each([
      ['admin', 200],
      ['accountant', 200],
      ['auditor', 200],
      ['viewer', 403],
    ] as [Role, number][])('%s -> %d', async (role, status) => {
      await code(role, 'get', '/audit').expect(status);
    });
  });

  describe('GET /reconcile — admin, accountant, auditor (not viewer)', () => {
    it.each([
      ['auditor', 200],
      ['viewer', 403],
    ] as [Role, number][])('%s -> %d', async (role, status) => {
      await code(role, 'get', '/reconcile').expect(status);
    });
  });

  describe('User management — admin only', () => {
    it.each([
      ['admin', 200],
      ['accountant', 403],
      ['auditor', 403],
      ['viewer', 403],
    ] as [Role, number][])('GET /users: %s -> %d', async (role, status) => {
      await code(role, 'get', '/users').expect(status);
    });

    it.each([
      ['admin', 200],
      ['accountant', 403],
      ['viewer', 403],
    ] as [Role, number][])('PATCH /users/:id/role: %s -> %d', async (role, status) => {
      await code(role, 'patch', `/users/${targetUserId}/role`, {
        role: 'accountant',
      }).expect(status);
    });
  });

  describe('Retention — admin only', () => {
    it.each([
      ['admin', 200],
      ['auditor', 403],
    ] as [Role, number][])('GET /retention: %s -> %d', async (role, status) => {
      await code(role, 'get', '/retention').expect(status);
    });
  });

  it('default-deny: no token -> 401', async () => {
    await request(server()).get('/accounts').expect(401);
    await request(server()).get('/retention').expect(401);
  });
});
