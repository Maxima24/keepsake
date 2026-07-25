import { Component, computed, inject, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { AuthStore } from './core/auth/auth.store';
import { LedgerApi, QueryKeys } from './core/api/ledger.api';
import { MagneticFillDirective } from './shared/ui/magnetic-fill.directive';
import { BrandMarkComponent } from './shared/ui/brand-mark.component';
import { IconComponent, IconName } from './shared/ui/icon.component';

interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  visible: () => boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MagneticFillDirective,
    BrandMarkComponent,
    IconComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly api = inject(LedgerApi);
  private readonly router = inject(Router);
  readonly store = inject(AuthStore);

  readonly canSeeAudit = computed(() =>
    this.store.hasRole('admin', 'accountant', 'auditor'),
  );
  readonly canPost = computed(() => this.store.hasRole('admin', 'accountant'));
  readonly isAdmin = computed(() => this.store.hasRole('admin'));

  /** Full nav model — sidebar + header breadcrumb both read from this. */
  readonly nav: NavItem[] = [
    { label: 'Post', path: '/post', icon: 'post', visible: () => this.canPost() },
    { label: 'Ledger', path: '/ledger', icon: 'ledger', visible: () => true },
    { label: 'Audit & Integrity', path: '/audit', icon: 'audit', visible: () => this.canSeeAudit() },
    { label: 'Reconciliation', path: '/reconciliation', icon: 'reconcile', visible: () => this.canSeeAudit() },
    { label: 'Point-in-time', path: '/pitr', icon: 'pitr', visible: () => this.canSeeAudit() },
    { label: 'Integrations', path: '/integrations', icon: 'plug', visible: () => this.isAdmin() },
    { label: 'Admin', path: '/admin', icon: 'admin', visible: () => this.isAdmin() },
  ];

  private readonly url = signal(this.router.url);

  /** Current area label for the header breadcrumb. */
  readonly area = computed(() => {
    const u = this.url();
    return this.nav.find((n) => u.startsWith(n.path))?.label ?? 'Ledger';
  });

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  // Live integrity badge — enabled only when the user may view audit.
  readonly verifyQuery = injectQuery(() => ({
    queryKey: [...QueryKeys.auditVerify, 'nav'],
    queryFn: () => lastValueFrom(this.api.getAuditVerify()),
    enabled: this.canSeeAudit(),
    refetchInterval: 15000,
  }));

  logout(): void {
    this.store.logout();
    this.router.navigateByUrl('/login');
  }
}
