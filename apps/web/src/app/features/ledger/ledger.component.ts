import { Component, inject } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import {
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { LedgerApi, QueryKeys } from '../../core/api/ledger.api';
import { formatDateTime, formatMinor } from '../../core/format';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-ledger',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './ledger.component.html',
})
export class LedgerComponent {
  private readonly api = inject(LedgerApi);
  private readonly queryClient = injectQueryClient();
  readonly formatMinor = formatMinor;
  readonly fmtDate = formatDateTime;

  readonly accountsQuery = injectQuery(() => ({
    queryKey: QueryKeys.accounts,
    queryFn: () => lastValueFrom(this.api.getAccounts()),
  }));

  readonly transactionsQuery = injectQuery(() => ({
    queryKey: QueryKeys.transactions,
    queryFn: () => lastValueFrom(this.api.getTransactions()),
  }));

  refresh(): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.accounts });
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.transactions });
  }

  accountName(id: string): string {
    const acc = (this.accountsQuery.data() ?? []).find((a) => a.id === id);
    return acc?.name ?? id.slice(0, 8);
  }
}
