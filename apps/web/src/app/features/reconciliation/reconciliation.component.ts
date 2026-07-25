import { Component, computed, inject, signal } from '@angular/core';
import { ReconciliationApi } from '../../core/api/reconciliation.api';
import {
  IngestSource,
  Match,
  ReconciliationRun,
  ReconciliationRunSummary,
  SourceARecord,
  SourceBRecord,
} from '../../core/models/reconciliation.models';
import { AuthStore } from '../../core/auth/auth.store';
import { formatDateTime, formatMinor } from '../../core/format';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-reconciliation',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './reconciliation.component.html',
})
export class ReconciliationComponent {
  private readonly api = inject(ReconciliationApi);
  private readonly store = inject(AuthStore);
  readonly formatMinor = formatMinor;
  readonly fmtDate = formatDateTime;

  readonly canRun = computed(() => this.store.hasRole('admin', 'accountant'));

  readonly sources = signal<IngestSource[]>([]);
  readonly sourceA = signal('');
  readonly sourceB = signal('');
  readonly windowFrom = signal(this.monthAgo());
  readonly windowTo = signal(this.nowLocal());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly run = signal<ReconciliationRun | null>(null);
  readonly recentRuns = signal<ReconciliationRunSummary[]>([]);

  readonly ledgerSources = computed(() =>
    this.sources().filter((s) => s.kind === 'ledger'),
  );
  readonly counterpartySources = computed(() =>
    this.sources().filter((s) => s.kind === 'counterparty'),
  );

  /** Matches folded by groupId so a settlement batch (N:1) reads as one match. */
  readonly groupedMatches = computed<{ key: string; matches: Match[] }[]>(() => {
    const r = this.run();
    if (!r) return [];
    const out: { key: string; matches: Match[] }[] = [];
    const idx = new Map<string, number>();
    for (const m of r.matches) {
      if (m.groupId) {
        const at = idx.get(m.groupId);
        if (at === undefined) {
          idx.set(m.groupId, out.length);
          out.push({ key: m.groupId, matches: [m] });
        } else {
          out[at].matches.push(m);
        }
      } else {
        out.push({ key: m.id, matches: [m] });
      }
    }
    return out;
  });

  constructor() {
    this.loadSources();
    this.loadRuns();
  }

  private loadRuns(): void {
    this.api.listRuns().subscribe({ next: (rs) => this.recentRuns.set(rs) });
  }

  loadRun(runId: string): void {
    this.api.getRun(runId).subscribe({ next: (r) => this.run.set(r) });
  }

  downloadRun(): void {
    const r = this.run();
    if (!r) return;
    const blob = new Blob([JSON.stringify(r, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keepsake-recon-${r.runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private loadSources(): void {
    this.api.listSources().subscribe({
      next: (s) => {
        this.sources.set(s);
        if (!this.sourceA() && this.ledgerSources()[0]) {
          this.sourceA.set(this.ledgerSources()[0].name);
        }
        if (!this.sourceB() && this.counterpartySources()[0]) {
          this.sourceB.set(this.counterpartySources()[0].name);
        }
      },
    });
  }

  runRecon(): void {
    if (!this.sourceA() || !this.sourceB()) {
      this.error.set('Pick both a ledger source and a counterparty source.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api
      .runReconciliation({
        sourceA: this.sourceA(),
        sourceB: this.sourceB(),
        windowFrom: new Date(this.windowFrom()).toISOString(),
        windowTo: new Date(this.windowTo()).toISOString(),
      })
      .subscribe({
        next: (r) => {
          this.run.set(r);
          this.loading.set(false);
          this.loadRuns();
        },
        error: (e: { error?: { message?: string } }) => {
          this.error.set(e?.error?.message ?? 'Reconciliation failed.');
          this.loading.set(false);
        },
      });
  }

  confirm(matchId: string): void {
    this.api.confirmMatch(matchId).subscribe({
      next: () => {
        const r = this.run();
        if (r) {
          this.api.getRun(r.runId).subscribe({ next: (fresh) => this.run.set(fresh) });
        }
      },
    });
  }

  aRec(id: string | null): SourceARecord | undefined {
    return id ? this.run()?.sourceARecords.find((a) => a.id === id) : undefined;
  }
  bRec(id: string | null): SourceBRecord | undefined {
    return id ? this.run()?.sourceBRecords.find((b) => b.id === id) : undefined;
  }

  canConfirm(m: Match): boolean {
    return m.method === 'fuzzy' && !m.confirmedBy && this.canRun();
  }

  breakCount(s: {
    unmatched_source_a: number;
    unmatched_source_b: number;
    amount_mismatch: number;
    duplicate: number;
  }): number {
    return (
      s.unmatched_source_a +
      s.unmatched_source_b +
      s.amount_mismatch +
      s.duplicate
    );
  }

  private nowLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  private monthAgo(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
}
