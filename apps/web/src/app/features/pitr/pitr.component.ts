import { Component, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { LedgerApi } from '../../core/api/ledger.api';
import { Account, Transaction } from '../../core/models/ledger.models';
import { formatDateTime, formatMinor } from '../../core/format';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-pitr',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './pitr.component.html',
})
export class PitrComponent {
  private readonly api = inject(LedgerApi);
  readonly formatMinor = formatMinor;
  readonly fmtDate = formatDateTime;

  readonly at = signal(this.nowLocal());
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly asOfAccounts = signal<Account[] | null>(null);
  readonly asOfTxns = signal<Transaction[] | null>(null);

  private atIso(): string {
    return new Date(this.at()).toISOString();
  }

  private nowLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.message.set(null);
    const iso = this.atIso();
    forkJoin([
      this.api.getAccountsAsOf(iso),
      this.api.getTransactionsAsOf(iso),
    ]).subscribe({
      next: ([accts, txns]) => {
        this.asOfAccounts.set(accts);
        this.asOfTxns.set(txns);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load as-of data.');
        this.loading.set(false);
      },
    });
  }

  export(): void {
    this.exporting.set(true);
    this.error.set(null);
    this.message.set(null);
    const iso = this.atIso();
    this.api.getExport(iso).subscribe({
      next: (doc) => {
        const blob = new Blob([JSON.stringify(doc, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `keepsake-export-${iso.replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        this.message.set(
          `Exported ${doc.audit.length} audit rows (exportHash ${doc.exportHash.slice(0, 12)}…). Verify offline with scripts/verify-export.ts.`,
        );
        this.exporting.set(false);
      },
      error: () => {
        this.error.set('Export failed.');
        this.exporting.set(false);
      },
    });
  }
}
