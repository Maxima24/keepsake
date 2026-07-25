import { Component, inject, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { LedgerApi, QueryKeys } from '../../core/api/ledger.api';
import { CreateTransactionInput } from '../../core/models/ledger.models';
import { UiStore } from '../../state/ui.store';
import { formatMinor } from '../../core/format';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-post-transaction',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './post-transaction.component.html',
})
export class PostTransactionComponent {
  private readonly api = inject(LedgerApi);
  private readonly queryClient = injectQueryClient();
  readonly store = inject(UiStore);
  readonly formatMinor = formatMinor;

  readonly successMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  // Server state (accounts for the dropdowns).
  readonly accountsQuery = injectQuery(() => ({
    queryKey: QueryKeys.accounts,
    queryFn: () => lastValueFrom(this.api.getAccounts()),
  }));

  // The post itself; on success invalidate every read query so the ledger,
  // audit and reconciliation views refresh.
  readonly postMutation = injectMutation(() => ({
    mutationFn: (input: CreateTransactionInput) =>
      lastValueFrom(this.api.postTransaction(input)),
    onSuccess: (tx) => {
      this.successMsg.set(
        `Posted "${tx.description}" — ${tx.entries.length} entries written atomically.`,
      );
      this.errorMsg.set(null);
      this.store.reset();
      for (const queryKey of [
        QueryKeys.accounts,
        QueryKeys.transactions,
        QueryKeys.audit,
        QueryKeys.reconcile,
      ]) {
        this.queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (err: unknown) => {
      this.successMsg.set(null);
      this.errorMsg.set(this.extractError(err));
    },
  }));

  onSubmit(event: Event): void {
    event.preventDefault();
    this.successMsg.set(null);
    this.errorMsg.set(null);
    if (!this.store.canSubmit()) {
      this.errorMsg.set(
        'Complete every row (account + positive amount) and make debits equal credits.',
      );
      return;
    }
    this.postMutation.mutate(this.store.toInput());
  }

  onAmount(index: number, value: string): void {
    const n = value === '' ? null : Number(value);
    this.store.patchEntry(index, {
      amount: n === null || Number.isNaN(n) ? null : n,
    });
  }

  private extractError(err: unknown): string {
    const e = err as { error?: { message?: string | string[] } };
    const msg = e?.error?.message;
    if (Array.isArray(msg)) return msg.join(' ');
    return msg ?? 'The API rejected this transaction.';
  }
}
