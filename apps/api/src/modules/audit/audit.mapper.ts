import { AuditDto } from './dto/audit.dto';

interface AuditRow {
  id: string;
  seq: bigint;
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  snapshot: unknown;
  prevHash: string | null;
  hash: string | null;
  createdAt: Date;
}

export function toAuditDto(row: AuditRow): AuditDto {
  return {
    id: row.id,
    seq: row.seq.toString(),
    entity: row.entity,
    entityId: row.entityId,
    action: row.action,
    actorId: row.actorId,
    snapshot: row.snapshot,
    prevHash: row.prevHash,
    hash: row.hash,
    createdAt: row.createdAt.toISOString(),
  };
}
