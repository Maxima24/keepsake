import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';

export const TEST_PASSWORD = 'password123';

export const USERS = [
  { email: 'admin@keepsake.local', role: 'admin' },
  { email: 'accountant@keepsake.local', role: 'accountant' },
  { email: 'auditor@keepsake.local', role: 'auditor' },
  { email: 'viewer@keepsake.local', role: 'viewer' },
] as const;

// Hash once and reuse — argon2 is deliberately slow.
let cachedHash: string | null = null;
async function passwordHash(): Promise<string> {
  if (!cachedHash) cachedHash = await argon2.hash(TEST_PASSWORD);
  return cachedHash;
}

/** Truncate everything and reseed the base fixtures: 3 accounts + 4 role users. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Match","ReconciliationRun","CounterpartyRecord","IngestFile","IngestedTransaction","IngestSource","ApiKey","Entry","Transaction","Account","AuditLog","AuditArchive","User","RetentionPolicy" RESTART IDENTITY CASCADE',
  );
  await prisma.account.createMany({
    data: [{ name: 'Cash' }, { name: 'Revenue' }, { name: 'Expenses' }],
  });
  const hash = await passwordHash();
  await prisma.user.createMany({
    data: USERS.map((u) => ({ email: u.email, passwordHash: hash, role: u.role })),
  });
}

export async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function accountId(
  prisma: PrismaService,
  name: string,
): Promise<string> {
  const a = await prisma.account.findUniqueOrThrow({ where: { name } });
  return a.id;
}

export async function countAll(prisma: PrismaService) {
  const [transactions, entries, audit, accounts] = await Promise.all([
    prisma.transaction.count(),
    prisma.entry.count(),
    prisma.auditLog.count(),
    prisma.account.count(),
  ]);
  return { transactions, entries, audit, accounts };
}

/** A balanced transaction body (Cash debit / Revenue credit) for the given amount. */
export function balancedBody(cashId: string, revId: string, amount = 1000, description = 'test sale') {
  return {
    description,
    entries: [
      { accountId: cashId, direction: 'debit', amount },
      { accountId: revId, direction: 'credit', amount },
    ],
  };
}
