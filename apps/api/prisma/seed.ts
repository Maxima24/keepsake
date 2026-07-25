import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { computeHash } from '../src/common/crypto/audit-hash';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type DemoEntry = { account: string; direction: 'debit' | 'credit'; amount: number };
type DemoTxn = { description: string; entries: DemoEntry[] };

// A few realistic, balanced transactions so the ledger isn't empty on a fresh DB.
// Amounts are integer minor units (e.g. cents). Convention: debit +, credit -.
const DEMO_TXNS: DemoTxn[] = [
  {
    description: 'Cash sale of goods',
    entries: [
      { account: 'Cash', direction: 'debit', amount: 250000 },
      { account: 'Revenue', direction: 'credit', amount: 250000 },
    ],
  },
  {
    description: 'Paid office rent',
    entries: [
      { account: 'Expenses', direction: 'debit', amount: 120000 },
      { account: 'Cash', direction: 'credit', amount: 120000 },
    ],
  },
  {
    description: 'Consulting income received',
    entries: [
      { account: 'Cash', direction: 'debit', amount: 500000 },
      { account: 'Revenue', direction: 'credit', amount: 500000 },
    ],
  },
  {
    description: 'Bought office supplies',
    entries: [
      { account: 'Expenses', direction: 'debit', amount: 45000 },
      { account: 'Cash', direction: 'credit', amount: 45000 },
    ],
  },
];

async function main(): Promise<void> {
  // 1. Base accounts (idempotent).
  const names = ['Cash', 'Revenue', 'Expenses'];
  for (const name of names) {
    await prisma.account.upsert({
      where: { name },
      update: {},
      create: { name, balance: 0 },
    });
  }
  console.log(`Seeded accounts: ${names.join(', ')}`);

  // 2. Users — one per role for testing (idempotent). Password: password123.
  const users: { email: string; role: 'admin' | 'accountant' | 'auditor' | 'viewer' }[] = [
    { email: 'admin@keepsake.local', role: 'admin' },
    { email: 'accountant@keepsake.local', role: 'accountant' },
    { email: 'auditor@keepsake.local', role: 'auditor' },
    { email: 'viewer@keepsake.local', role: 'viewer' },
  ];
  const passwordHash = await argon2.hash('password123');
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, passwordHash, role: u.role },
    });
  }
  console.log(`Seeded ${users.length} users (password: password123)`);

  // 3. Demo transactions — only if the ledger is empty, so re-running is safe.
  const existing = await prisma.transaction.count();
  if (existing > 0) {
    console.log(
      `Ledger already has ${existing} transaction(s); skipping demo transactions.`,
    );
    return;
  }

  const accounts = await prisma.account.findMany();
  const idByName = new Map(accounts.map((a) => [a.name, a.id]));

  // Each demo transaction uses the SAME atomic, balanced, audited procedure the
  // API enforces — so reconciliation stays green.
  for (const txn of DEMO_TXNS) {
    await prisma.$transaction(async (tx) => {
      const debit = txn.entries
        .filter((e) => e.direction === 'debit')
        .reduce((s, e) => s + e.amount, 0);
      const credit = txn.entries
        .filter((e) => e.direction === 'credit')
        .reduce((s, e) => s + e.amount, 0);
      if (debit !== credit) {
        throw new Error(`Demo transaction "${txn.description}" is unbalanced.`);
      }

      const created = await tx.transaction.create({
        data: { description: txn.description },
      });
      await tx.entry.createMany({
        data: txn.entries.map((e) => ({
          transactionId: created.id,
          accountId: idByName.get(e.account)!,
          direction: e.direction,
          amount: e.amount,
        })),
      });
      for (const e of txn.entries) {
        await tx.account.update({
          where: { id: idByName.get(e.account)! },
          data: {
            balance: { increment: e.direction === 'debit' ? e.amount : -e.amount },
          },
        });
      }
      const full = await tx.transaction.findUniqueOrThrow({
        where: { id: created.id },
        include: { entries: true },
      });
      // Append a hash-chained audit row (same procedure as the API).
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(4242)');
      const head = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' } });
      const seq = head ? head.seq + 1n : 1n;
      const prevHash = head?.hash ?? null;
      const auditCreatedAt = new Date();
      const snapshot = JSON.parse(JSON.stringify(full));
      const hash = computeHash(
        {
          seq: seq.toString(),
          entity: 'transaction',
          entityId: created.id,
          action: 'created',
          actorId: null,
          createdAt: auditCreatedAt.toISOString(),
          snapshot,
        },
        prevHash,
      );
      await tx.auditLog.create({
        data: {
          seq,
          entity: 'transaction',
          entityId: created.id,
          action: 'created',
          actorId: null,
          snapshot,
          prevHash,
          hash,
          createdAt: auditCreatedAt,
        },
      });
    });
  }
  console.log(`Seeded ${DEMO_TXNS.length} demo transactions.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
