import {
  AuditContent,
  canonicalize,
  computeHash,
  stableStringify,
} from '../src/common/crypto/audit-hash';

const base: AuditContent = {
  seq: '1',
  entity: 'transaction',
  entityId: 'x',
  action: 'created',
  actorId: null,
  createdAt: '2020-01-01T00:00:00.000Z',
  snapshot: { amount: 100, note: 'z' },
};

describe('audit-hash (the single canonicalization)', () => {
  it('stableStringify is key-order independent and recursive', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
    expect(stableStringify({ x: { z: 1, a: 2 } })).toBe('{"x":{"a":2,"z":1}}');
  });

  it('canonicalize is deterministic regardless of key order', () => {
    const c1 = canonicalize(base);
    const c2 = canonicalize({
      snapshot: { note: 'z', amount: 100 },
      createdAt: base.createdAt,
      actorId: null,
      action: 'created',
      entityId: 'x',
      entity: 'transaction',
      seq: '1',
    });
    expect(c1).toBe(c2);
  });

  it('computeHash produces a sha256 hex and chains via prevHash', () => {
    const genesis = computeHash(base, null);
    expect(genesis).toMatch(/^[0-9a-f]{64}$/);
    expect(computeHash(base, null)).toBe(genesis); // deterministic
    expect(computeHash(base, 'abc')).not.toBe(genesis); // prevHash matters
  });

  it('any change to the hashed content changes the hash', () => {
    const h = computeHash(base, null);
    expect(computeHash({ ...base, action: 'tampered' }, null)).not.toBe(h);
    expect(computeHash({ ...base, snapshot: { amount: 101, note: 'z' } }, null)).not.toBe(h);
    expect(computeHash({ ...base, seq: '2' }, null)).not.toBe(h);
  });
});
