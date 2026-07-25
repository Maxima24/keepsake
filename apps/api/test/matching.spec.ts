import {
  ARecord,
  BRecord,
  matchRecords,
  summarize,
} from '../src/modules/reconciliation/matching';

const day = (n: number) => new Date(Date.UTC(2026, 2, n));

function a(
  id: string,
  amount: number,
  reference: string | null,
  occurred: number,
  direction = 'debit',
): ARecord {
  return { id, amount, reference, direction, occurredAt: day(occurred) };
}
function b(
  id: string,
  amount: number,
  reference: string | null,
  value: number,
  direction = 'debit',
): BRecord {
  return { id, amount, reference, direction, valueDate: day(value) };
}

describe('matchRecords', () => {
  it('matches on reference + amount (highest confidence)', () => {
    const res = matchRecords([a('a1', 1000, 'R1', 3)], [b('b1', 1000, 'R1', 3)]);
    const m = res.find((r) => r.sourceRecordId === 'a1');
    expect(m).toMatchObject({
      outcome: 'matched',
      method: 'ref_amount',
      confidence: 100,
      counterpartyRecordId: 'b1',
    });
  });

  it('flags an amount mismatch when the reference matches but amounts differ', () => {
    const res = matchRecords([a('a1', 1000, 'R1', 3)], [b('b1', 999, 'R1', 3)]);
    expect(res.find((r) => r.sourceRecordId === 'a1')).toMatchObject({
      outcome: 'amount_mismatch',
      method: 'exact_ref',
    });
  });

  it('fuzzy-matches on amount + near value-date when references differ', () => {
    const res = matchRecords(
      [a('a1', 5000, null, 3)],
      [b('b1', 5000, null, 5)], // 2 days off, within default 3-day tolerance
    );
    const m = res.find((r) => r.sourceRecordId === 'a1');
    expect(m?.outcome).toBe('matched');
    expect(m?.method).toBe('fuzzy');
    expect(m?.confidence).toBeGreaterThanOrEqual(50);
    expect(m?.confidence).toBeLessThan(100);
  });

  it('does NOT fuzzy-match when the date is outside tolerance', () => {
    const res = matchRecords([a('a1', 5000, null, 3)], [b('b1', 5000, null, 20)]);
    expect(res.find((r) => r.sourceRecordId === 'a1')?.outcome).toBe(
      'unmatched_source_a',
    );
    expect(res.find((r) => r.counterpartyRecordId === 'b1')?.outcome).toBe(
      'unmatched_source_b',
    );
  });

  it('aggregates many-to-one: two ledger txns summing to one bank line', () => {
    const res = matchRecords(
      [a('a1', 3000, null, 3), a('a2', 7000, null, 3)],
      [b('b1', 10000, null, 3)],
    );
    const group = res.filter((r) => r.method === 'aggregate');
    expect(group).toHaveLength(2);
    expect(group.every((r) => r.outcome === 'matched')).toBe(true);
    expect(group[0].groupId).toBe(group[1].groupId);
    expect(group.map((r) => r.sourceRecordId).sort()).toEqual(['a1', 'a2']);
    expect(group.every((r) => r.counterpartyRecordId === 'b1')).toBe(true);
  });

  it('flags a duplicate when the same (reference, amount) appears twice on a side', () => {
    const res = matchRecords(
      [],
      [b('b1', 1000, 'R1', 3), b('b2', 1000, 'R1', 3)],
    );
    expect(res.filter((r) => r.outcome === 'duplicate')).toHaveLength(1);
  });

  it('reports leftovers as unmatched on each side', () => {
    const res = matchRecords([a('a1', 1, null, 3)], [b('b1', 2, null, 3)]);
    const s = summarize(res);
    expect(s.unmatched_source_a).toBe(1);
    expect(s.unmatched_source_b).toBe(1);
    expect(s.reconciled).toBe(false);
  });

  it('summarize.reconciled is true only when there are no breaks', () => {
    const clean = summarize(
      matchRecords([a('a1', 1000, 'R1', 3)], [b('b1', 1000, 'R1', 3)]),
    );
    expect(clean.reconciled).toBe(true);
    expect(clean.matched).toBe(1);
  });
});
