import { Component, computed, inject } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import {
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { LedgerApi, QueryKeys } from '../../core/api/ledger.api';
import { AuditLog } from '../../core/models/ledger.models';
import { formatDateTime, formatMinor } from '../../core/format';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-audit-reconcile',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './audit-reconcile.component.html',
})
export class AuditReconcileComponent {
  private readonly api = inject(LedgerApi);
  private readonly queryClient = injectQueryClient();
  readonly formatMinor = formatMinor;
  readonly fmtDate = formatDateTime;

  readonly auditQuery = injectQuery(() => ({
    queryKey: QueryKeys.audit,
    queryFn: () => lastValueFrom(this.api.getAudit()),
  }));
  readonly reconcileQuery = injectQuery(() => ({
    queryKey: QueryKeys.reconcile,
    queryFn: () => lastValueFrom(this.api.getReconcile()),
  }));
  readonly verifyQuery = injectQuery(() => ({
    queryKey: QueryKeys.auditVerify,
    queryFn: () => lastValueFrom(this.api.getAuditVerify()),
  }));

  readonly discrepancies = computed(
    () =>
      this.reconcileQuery.data()?.accounts.filter((a) => !a.inAgreement) ?? [],
  );

  refresh(): void {
    this.queryClient.invalidateQueries({ queryKey: ['audit'] });
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.reconcile });
  }

  snapshotDesc(log: AuditLog): string {
    const snap = log.snapshot as { description?: string } | null;
    return snap?.description ?? '';
  }

  short(hash: string | null): string {
    return hash ? hash.slice(0, 12) + '…' : '—';
  }

  actorShort(id: string | null): string {
    return id ? id.slice(0, 8) : 'system';
  }
}
