export interface AuditDto {
  id: string;
  seq: string; // BigInt as string
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  snapshot: unknown;
  prevHash: string | null;
  hash: string | null;
  createdAt: string; // ISO string
}
