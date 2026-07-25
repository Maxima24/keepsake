import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { Role } from '../../common/roles';

@Injectable()
export class AuthRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: { email: string; passwordHash: string; role: Role }) {
    return this.prisma.user.create({ data });
  }

  findAll() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  }

  /** Change a user's role, audited into the hash chain in the same transaction. */
  updateRole(id: string, role: Role, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id } });
      const user = await tx.user.update({ where: { id }, data: { role } });
      await this.audit.appendInTx(tx, {
        entity: 'user',
        entityId: id,
        action: 'role_changed',
        actorId,
        snapshot: {
          email: user.email,
          before: { role: before.role },
          after: { role: user.role },
        },
      });
      return user;
    });
  }

  /** Enable/disable a user, audited into the hash chain in the same transaction. */
  setDisabled(id: string, disabled: boolean, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id } });
      const user = await tx.user.update({ where: { id }, data: { disabled } });
      await this.audit.appendInTx(tx, {
        entity: 'user',
        entityId: id,
        action: disabled ? 'disabled' : 'enabled',
        actorId,
        snapshot: {
          email: user.email,
          before: { disabled: before.disabled },
          after: { disabled: user.disabled },
        },
      });
      return user;
    });
  }
}
