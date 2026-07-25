import { createHash } from 'node:crypto';

/**
 * THE single canonicalization used everywhere a hash is computed — posting,
 * verifying, and exporting. Divergence here silently breaks the chain.
 */
export interface AuditContent {
  seq: string; // BigInt as a decimal string (deterministic)
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  createdAt: string; // ISO
  snapshot: unknown;
}

/** Recursively key-sorted JSON — order-independent, so JSONB key reordering can't change the hash. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  );
}

export function canonicalize(content: AuditContent): string {
  return stableStringify({
    seq: content.seq,
    entity: content.entity,
    entityId: content.entityId,
    action: content.action,
    actorId: content.actorId,
    createdAt: content.createdAt,
    snapshot: content.snapshot,
  });
}

export function computeHash(
  content: AuditContent,
  prevHash: string | null,
): string {
  return createHash('sha256')
    .update(canonicalize(content) + (prevHash ?? 'GENESIS'))
    .digest('hex');
}
