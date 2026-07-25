import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';

/** API keys are high-entropy tokens, so a fast SHA-256 lookup is correct here
 * (argon2 is for low-entropy passwords). Only this hash is stored. */
export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class ApiKeyRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
  ) {}

  findByHash(hash: string) {
    return this.prisma.apiKey.findUnique({ where: { hash } });
  }

  findServiceUser(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  touch(id: string) {
    return this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  list() {
    return this.prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** Create a service User + its API key + an audit row, atomically.
   * Returns the stored record and the one-time plaintext key. */
  async mint(label: string, actorId: string) {
    const raw = `sk_live_${randomBytes(24).toString('hex')}`;
    const hash = hashKey(raw);
    const prefix = `${raw.slice(0, 14)}…`;
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));

    const record = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: `svc.${raw.slice(8, 20)}@keepsake.local`,
          passwordHash,
          role: 'service',
        },
      });
      const key = await tx.apiKey.create({
        data: { label, hash, prefix, serviceUserId: user.id },
      });
      await this.audit.appendInTx(tx, {
        entity: 'api_key',
        entityId: key.id,
        action: 'api_key_minted',
        actorId,
        snapshot: { label, prefix, serviceUserId: user.id },
      });
      return key;
    });

    return { record, key: raw };
  }

  /** Revoke a key (disable it and its service user) and audit the change. */
  async revoke(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const key = await tx.apiKey.update({
        where: { id },
        data: { disabled: true },
      });
      await tx.user.update({
        where: { id: key.serviceUserId },
        data: { disabled: true },
      });
      await this.audit.appendInTx(tx, {
        entity: 'api_key',
        entityId: id,
        action: 'api_key_revoked',
        actorId,
        snapshot: { label: key.label, prefix: key.prefix },
      });
      return key;
    });
  }
}
