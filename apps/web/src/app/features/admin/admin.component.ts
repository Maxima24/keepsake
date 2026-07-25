import { Component, inject, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { AdminApi, AdminKeys } from '../../core/api/admin.api';
import { Role, User } from '../../core/models/auth.models';
import { formatDateTime } from '../../core/format';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  private readonly admin = inject(AdminApi);
  private readonly queryClient = injectQueryClient();
  readonly fmtDate = formatDateTime;
  readonly roles: Role[] = ['admin', 'accountant', 'auditor', 'viewer'];
  readonly retentionDays = signal<string>('');
  readonly message = signal<string | null>(null);

  readonly usersQuery = injectQuery(() => ({
    queryKey: AdminKeys.users,
    queryFn: () => lastValueFrom(this.admin.listUsers()),
  }));
  readonly retentionQuery = injectQuery(() => ({
    queryKey: AdminKeys.retention,
    queryFn: () => lastValueFrom(this.admin.getRetention()),
  }));

  readonly roleMutation = injectMutation(() => ({
    mutationFn: (v: { id: string; role: Role }) =>
      lastValueFrom(this.admin.changeRole(v.id, v.role)),
    onSuccess: () => {
      this.message.set('Role updated (audited).');
      this.invalidateUsersAndAudit();
    },
  }));
  readonly disableMutation = injectMutation(() => ({
    mutationFn: (v: { id: string; disabled: boolean }) =>
      lastValueFrom(this.admin.setDisabled(v.id, v.disabled)),
    onSuccess: () => {
      this.message.set('User updated (audited).');
      this.invalidateUsersAndAudit();
    },
  }));
  readonly retentionMutation = injectMutation(() => ({
    mutationFn: (days: number | null) =>
      lastValueFrom(this.admin.updateRetention(days)),
    onSuccess: () => {
      this.message.set('Retention policy saved (audited).');
      this.queryClient.invalidateQueries({ queryKey: AdminKeys.retention });
      this.queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  }));
  readonly archiveMutation = injectMutation(() => ({
    mutationFn: () => lastValueFrom(this.admin.runArchival()),
    onSuccess: (r) => {
      this.message.set(
        `Archival complete — ${r.archived} rows archived; the live chain still verifies via a checkpoint.`,
      );
      this.queryClient.invalidateQueries({ queryKey: ['audit'] });
      this.queryClient.invalidateQueries({ queryKey: ['reconcile'] });
    },
  }));

  onRoleChange(id: string, role: string): void {
    this.roleMutation.mutate({ id, role: role as Role });
  }
  toggleDisabled(u: User): void {
    this.disableMutation.mutate({ id: u.id, disabled: !u.disabled });
  }
  saveRetention(): void {
    const v = this.retentionDays().trim();
    this.retentionMutation.mutate(v === '' ? null : Number(v));
  }
  runArchival(): void {
    this.archiveMutation.mutate();
  }

  private invalidateUsersAndAudit(): void {
    this.queryClient.invalidateQueries({ queryKey: AdminKeys.users });
    this.queryClient.invalidateQueries({ queryKey: ['audit'] });
  }
}
