import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth/guards';
import { LoginComponent } from './features/login/login.component';
import { PostTransactionComponent } from './features/post-transaction/post-transaction.component';
import { LedgerComponent } from './features/ledger/ledger.component';
import { AuditReconcileComponent } from './features/audit-reconcile/audit-reconcile.component';
import { PitrComponent } from './features/pitr/pitr.component';
import { AdminComponent } from './features/admin/admin.component';
import { ReconciliationComponent } from './features/reconciliation/reconciliation.component';
import { IntegrationsComponent } from './features/integrations/integrations.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, title: 'Sign in — Keepsake' },
  { path: '', pathMatch: 'full', redirectTo: 'ledger' },
  {
    path: 'post',
    component: PostTransactionComponent,
    canActivate: [authGuard, roleGuard('admin', 'accountant')],
    title: 'Post — Keepsake',
  },
  {
    path: 'ledger',
    component: LedgerComponent,
    canActivate: [authGuard],
    title: 'Ledger — Keepsake',
  },
  {
    path: 'audit',
    component: AuditReconcileComponent,
    canActivate: [authGuard, roleGuard('admin', 'accountant', 'auditor')],
    title: 'Audit & Integrity — Keepsake',
  },
  {
    path: 'pitr',
    component: PitrComponent,
    canActivate: [authGuard, roleGuard('admin', 'accountant', 'auditor')],
    title: 'Point-in-time — Keepsake',
  },
  {
    path: 'reconciliation',
    component: ReconciliationComponent,
    canActivate: [authGuard, roleGuard('admin', 'accountant', 'auditor')],
    title: 'Reconciliation — Keepsake',
  },
  {
    path: 'integrations',
    component: IntegrationsComponent,
    canActivate: [authGuard, roleGuard('admin')],
    title: 'Integrations — Keepsake',
  },
  {
    path: 'admin',
    component: AdminComponent,
    canActivate: [authGuard, roleGuard('admin')],
    title: 'Admin — Keepsake',
  },
  { path: '**', redirectTo: 'ledger' },
];
