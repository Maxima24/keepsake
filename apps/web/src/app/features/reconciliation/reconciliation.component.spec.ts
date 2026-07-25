import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ReconciliationComponent } from './reconciliation.component';
import { ReconciliationApi } from '../../core/api/reconciliation.api';
import { AuthStore } from '../../core/auth/auth.store';
import {
  Match,
  ReconciliationRun,
} from '../../core/models/reconciliation.models';

function makeRun(over: Partial<ReconciliationRun> = {}): ReconciliationRun {
  return {
    runId: 'run-1',
    sourceAId: 'a',
    sourceBId: 'b',
    windowFrom: '2026-03-01T00:00:00.000Z',
    windowTo: '2026-03-31T00:00:00.000Z',
    reconciled: false,
    exportHash: 'abc123def456',
    summary: {
      matched: 0,
      unmatched_source_a: 0,
      unmatched_source_b: 0,
      amount_mismatch: 0,
      duplicate: 0,
      l2Unposted: 0,
      reconciled: false,
    },
    matches: [],
    sourceARecords: [],
    sourceBRecords: [],
    ...over,
  };
}

const match = (over: Partial<Match>): Match => ({
  id: 'm',
  outcome: 'matched',
  method: 'exact_ref',
  confidence: 100,
  sourceRecordId: null,
  counterpartyRecordId: null,
  groupId: null,
  confirmedBy: null,
  ...over,
});

function create(role: 'admin' | 'auditor' = 'admin'): ReconciliationComponent {
  const api = {
    listSources: () => of([]),
    listRuns: () => of([]),
    getRun: () => of(makeRun()),
    runReconciliation: () => of(makeRun()),
    confirmMatch: () => of(match({})),
  };
  const authStore = {
    hasRole: (...roles: string[]) => roles.includes(role),
  };
  TestBed.configureTestingModule({
    imports: [ReconciliationComponent],
    providers: [
      { provide: ReconciliationApi, useValue: api },
      { provide: AuthStore, useValue: authStore },
    ],
  });
  return TestBed.createComponent(ReconciliationComponent).componentInstance;
}

describe('ReconciliationComponent', () => {
  describe('groupedMatches', () => {
    it('folds many-to-one matches by groupId, singles standalone', () => {
      const c = create();
      c.run.set(
        makeRun({
          matches: [
            match({ id: 'm1', groupId: 'g1' }),
            match({ id: 'm2', groupId: 'g1' }),
            match({ id: 'm3', groupId: null }),
          ],
        }),
      );
      const groups = c.groupedMatches();
      expect(groups.length).toBe(2);
      expect(groups[0].matches.map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(groups[1].matches.map((m) => m.id)).toEqual(['m3']);
    });

    it('is empty with no run', () => {
      expect(create().groupedMatches()).toEqual([]);
    });
  });

  describe('drill-in resolution', () => {
    it('resolves aRec/bRec by id and returns undefined for null or missing', () => {
      const c = create();
      c.run.set(
        makeRun({
          sourceARecords: [
            {
              id: 'a1',
              externalId: 'x1',
              reference: 'R1',
              amount: 100,
              direction: 'debit',
              occurredAt: '2026-03-03T00:00:00.000Z',
              matchState: 'matched',
              needsMapping: false,
            },
          ],
          sourceBRecords: [
            {
              id: 'b1',
              reference: 'R1',
              amount: 100,
              direction: 'debit',
              valueDate: '2026-03-03T00:00:00.000Z',
              matchState: 'matched',
              rawRow: {},
            },
          ],
        }),
      );
      expect(c.aRec('a1')?.reference).toBe('R1');
      expect(c.bRec('b1')?.amount).toBe(100);
      expect(c.aRec('missing')).toBeUndefined();
      expect(c.aRec(null)).toBeUndefined();
      expect(c.bRec(null)).toBeUndefined();
    });
  });

  describe('canConfirm', () => {
    it('allows only unconfirmed fuzzy matches for a run-capable role', () => {
      const admin = create('admin');
      expect(admin.canConfirm(match({ method: 'fuzzy', confirmedBy: null }))).toBe(true);
      expect(admin.canConfirm(match({ method: 'exact_ref', confirmedBy: null }))).toBe(false);
      expect(admin.canConfirm(match({ method: 'fuzzy', confirmedBy: 'u1' }))).toBe(false);
    });

    it('blocks confirming for a non-run role (auditor)', () => {
      const auditor = create('auditor');
      expect(auditor.canConfirm(match({ method: 'fuzzy', confirmedBy: null }))).toBe(false);
    });
  });

  describe('breakCount', () => {
    it('sums the four break outcomes', () => {
      expect(
        create().breakCount({
          unmatched_source_a: 1,
          unmatched_source_b: 2,
          amount_mismatch: 3,
          duplicate: 4,
        }),
      ).toBe(10);
    });
  });
});
