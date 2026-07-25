/**
 * The matching engine (pure, DB-free — so it is exhaustively unit-testable).
 * Given a window of Source-A records (ledger mirror) and Source-B records
 * (counterparty file), it produces a set of match results, tiered cheapest-first:
 *   1. ref_amount     — reference matches AND amount agrees            (confidence 100)
 *   2. exact_ref      — reference matches but amount differs           → amount_mismatch
 *   3. fuzzy          — amount agrees + value-date within tolerance    (scored)
 *   4. aggregate      — several records on one side sum to one on the  (N:1 / 1:N)
 *                       other (settlement batches), linked by groupId
 * Anything left over is unmatched_source_a / unmatched_source_b. Exact duplicates
 * within one side are flagged 'duplicate'.
 */

export interface ARecord {
  id: string;
  reference: string | null;
  amount: number;
  direction: string;
  occurredAt: Date;
}
export interface BRecord {
  id: string;
  reference: string | null;
  amount: number;
  direction: string;
  valueDate: Date;
}

export type MatchOutcome =
  | 'matched'
  | 'unmatched_source_a'
  | 'unmatched_source_b'
  | 'amount_mismatch'
  | 'duplicate';
export type MatchMethod = 'exact_ref' | 'ref_amount' | 'fuzzy' | 'aggregate' | 'none';

export interface MatchResult {
  outcome: MatchOutcome;
  method: MatchMethod;
  confidence: number; // 0-100
  sourceRecordId: string | null; // A
  counterpartyRecordId: string | null; // B
  groupId: string | null;
}

export interface MatchOptions {
  toleranceDays?: number; // fuzzy date window, default 3
  maxAggregateSize?: number; // largest N in an N:1 / 1:N group, default 6
  maxAggregatePool?: number; // skip aggregation when the candidate pool exceeds this
}

const DAY = 86_400_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Exact subset (size ≥ 2) of `pool` summing to `target`; bounded backtracking. */
function findSubset(
  pool: { id: string; amount: number }[],
  target: number,
  maxSize: number,
): string[] | null {
  const items = [...pool].sort((a, b) => b.amount - a.amount);
  const chosen: string[] = [];
  const search = (start: number, remaining: number): boolean => {
    if (remaining === 0 && chosen.length >= 2) return true;
    if (remaining <= 0 || chosen.length >= maxSize) return false;
    for (let i = start; i < items.length; i++) {
      if (items[i].amount > remaining) continue; // sorted desc → prune
      chosen.push(items[i].id);
      if (search(i + 1, remaining - items[i].amount)) return true;
      chosen.pop();
    }
    return false;
  };
  return search(0, target) ? [...chosen] : null;
}

export function matchRecords(
  aRecs: ARecord[],
  bRecs: BRecord[],
  opts: MatchOptions = {},
): MatchResult[] {
  const toleranceMs = (opts.toleranceDays ?? 3) * DAY;
  const maxSize = opts.maxAggregateSize ?? 6;
  const maxPool = opts.maxAggregatePool ?? 25;

  const results: MatchResult[] = [];
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  let groupCounter = 0;

  // ---- Duplicate flagging: same (reference, amount) twice within a side. ----
  const flagDuplicates = <T extends { id: string; reference: string | null; amount: number }>(
    recs: T[],
    used: Set<string>,
    side: 'a' | 'b',
  ) => {
    const seen = new Map<string, string>();
    for (const r of recs) {
      const key = `${r.reference ?? ''}|${r.amount}`;
      if (seen.has(key)) {
        used.add(r.id);
        results.push({
          outcome: 'duplicate',
          method: 'none',
          confidence: 100,
          sourceRecordId: side === 'a' ? r.id : null,
          counterpartyRecordId: side === 'b' ? r.id : null,
          groupId: null,
        });
      } else {
        seen.set(key, r.id);
      }
    }
  };
  flagDuplicates(aRecs, usedA, 'a');
  flagDuplicates(bRecs, usedB, 'b');

  // ---- Tiers 1 & 2: reference-based. ----
  const bByRef = new Map<string, BRecord[]>();
  for (const b of bRecs) {
    if (b.reference == null) continue;
    (bByRef.get(b.reference) ?? bByRef.set(b.reference, []).get(b.reference)!).push(b);
  }
  for (const a of aRecs) {
    if (usedA.has(a.id) || a.reference == null) continue;
    const candidates = (bByRef.get(a.reference) ?? []).filter((b) => !usedB.has(b.id));
    if (candidates.length === 0) continue;
    const exact = candidates.find((b) => b.amount === a.amount);
    if (exact) {
      results.push({
        outcome: 'matched',
        method: 'ref_amount',
        confidence: 100,
        sourceRecordId: a.id,
        counterpartyRecordId: exact.id,
        groupId: null,
      });
      usedA.add(a.id);
      usedB.add(exact.id);
    } else {
      const b = candidates[0];
      results.push({
        outcome: 'amount_mismatch',
        method: 'exact_ref',
        confidence: 60,
        sourceRecordId: a.id,
        counterpartyRecordId: b.id,
        groupId: null,
      });
      usedA.add(a.id);
      usedB.add(b.id);
    }
  }

  // ---- Tier 3: fuzzy (amount + value-date within tolerance, direction as a nudge). ----
  for (const a of aRecs) {
    if (usedA.has(a.id)) continue;
    const cand = bRecs
      .filter(
        (b) =>
          !usedB.has(b.id) &&
          b.amount === a.amount &&
          Math.abs(b.valueDate.getTime() - a.occurredAt.getTime()) <= toleranceMs,
      )
      .sort(
        (x, y) =>
          Math.abs(x.valueDate.getTime() - a.occurredAt.getTime()) -
          Math.abs(y.valueDate.getTime() - a.occurredAt.getTime()),
      );
    if (cand.length === 0) continue;
    const b = cand[0];
    const days = Math.abs(b.valueDate.getTime() - a.occurredAt.getTime()) / DAY;
    let confidence = 90 - Math.round(days * 8);
    confidence += a.direction === b.direction ? 5 : -5;
    results.push({
      outcome: 'matched',
      method: 'fuzzy',
      confidence: clamp(confidence, 50, 95),
      sourceRecordId: a.id,
      counterpartyRecordId: b.id,
      groupId: null,
    });
    usedA.add(a.id);
    usedB.add(b.id);
  }

  // ---- Tier 4: aggregate. N A's summing to one B, then one A splitting into N B's. ----
  const withinWindow = (t1: number, t2: number) => Math.abs(t1 - t2) <= toleranceMs * 2;

  for (const b of bRecs) {
    if (usedB.has(b.id)) continue;
    const pool = aRecs.filter(
      (a) => !usedA.has(a.id) && withinWindow(a.occurredAt.getTime(), b.valueDate.getTime()),
    );
    if (pool.length < 2 || pool.length > maxPool) continue;
    const subset = findSubset(pool, b.amount, maxSize);
    if (!subset) continue;
    const groupId = `g${groupCounter++}`;
    usedB.add(b.id);
    for (const aid of subset) {
      usedA.add(aid);
      results.push({
        outcome: 'matched',
        method: 'aggregate',
        confidence: 85,
        sourceRecordId: aid,
        counterpartyRecordId: b.id,
        groupId,
      });
    }
  }

  for (const a of aRecs) {
    if (usedA.has(a.id)) continue;
    const pool = bRecs.filter(
      (b) => !usedB.has(b.id) && withinWindow(b.valueDate.getTime(), a.occurredAt.getTime()),
    );
    if (pool.length < 2 || pool.length > maxPool) continue;
    const subset = findSubset(pool, a.amount, maxSize);
    if (!subset) continue;
    const groupId = `g${groupCounter++}`;
    usedA.add(a.id);
    for (const bid of subset) {
      usedB.add(bid);
      results.push({
        outcome: 'matched',
        method: 'aggregate',
        confidence: 85,
        sourceRecordId: a.id,
        counterpartyRecordId: bid,
        groupId,
      });
    }
  }

  // ---- Leftovers: unmatched on each side. ----
  for (const a of aRecs) {
    if (usedA.has(a.id)) continue;
    results.push({
      outcome: 'unmatched_source_a',
      method: 'none',
      confidence: 0,
      sourceRecordId: a.id,
      counterpartyRecordId: null,
      groupId: null,
    });
  }
  for (const b of bRecs) {
    if (usedB.has(b.id)) continue;
    results.push({
      outcome: 'unmatched_source_b',
      method: 'none',
      confidence: 0,
      sourceRecordId: null,
      counterpartyRecordId: b.id,
      groupId: null,
    });
  }

  return results;
}

export interface ReconcileSummary {
  matched: number;
  unmatched_source_a: number;
  unmatched_source_b: number;
  amount_mismatch: number;
  duplicate: number;
  reconciled: boolean; // no breaks: everything matched
}

/** Roll match results into the run summary. `reconciled` is true iff no breaks remain. */
export function summarize(results: MatchResult[]): ReconcileSummary {
  const s: ReconcileSummary = {
    matched: 0,
    unmatched_source_a: 0,
    unmatched_source_b: 0,
    amount_mismatch: 0,
    duplicate: 0,
    reconciled: false,
  };
  for (const r of results) s[r.outcome]++;
  s.reconciled =
    s.unmatched_source_a === 0 &&
    s.unmatched_source_b === 0 &&
    s.amount_mismatch === 0;
  return s;
}
