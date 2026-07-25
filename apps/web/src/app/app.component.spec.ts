import { signal } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
  discardPeriodicTasks,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { of } from 'rxjs';

import { AppComponent } from './app.component';
import { AuthStore } from './core/auth/auth.store';
import { LedgerApi } from './core/api/ledger.api';
import { Role, User } from './core/models/auth.models';
import { VerifyResult } from './core/models/ledger.models';

function userFixture(role: Role): User {
  return {
    id: `u-${role}`,
    email: `${role}@keepsake.local`,
    role,
    disabled: false,
    createdAt: '2020-01-01T00:00:00.000Z',
  };
}

const VALID: VerifyResult = { valid: true, brokenAtSeq: null, checked: 3 };

/**
 * Render AppComponent with a fake AuthStore (role → currentUser) and a fake
 * LedgerApi whose /audit/verify returns `verify`. Everything the real component
 * touches is stubbed at those two boundaries; the router + TanStack Query are real.
 */
function render(role: Role | null, verify: VerifyResult = VALID) {
  const currentUser = signal<User | null>(role ? userFixture(role) : null);
  const authStore = {
    isAuthenticated: () => currentUser() !== null,
    currentUser,
    hasRole: (...roles: Role[]) => {
      const u = currentUser();
      return !!u && roles.includes(u.role);
    },
    logout: jasmine.createSpy('logout'),
  };
  const ledgerApi = { getAuditVerify: () => of(verify) };

  TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideRouter([]),
      provideTanStackQuery(new QueryClient()),
      { provide: AuthStore, useValue: authStore },
      { provide: LedgerApi, useValue: ledgerApi },
    ],
  });

  const fixture = TestBed.createComponent(AppComponent);
  fixture.detectChanges();
  return fixture;
}

function navText(fixture: ComponentFixture<AppComponent>): string {
  return Array.from(
    fixture.nativeElement.querySelectorAll('nav a') as NodeListOf<HTMLElement>,
  )
    .map((a) => a.textContent!.trim())
    .join(' | ');
}

/** Let the injectQuery for /audit/verify settle, then drop its 15s poll timer. */
function settleVerifyQuery(fixture: ComponentFixture<AppComponent>): void {
  tick();
  fixture.detectChanges();
  tick();
  fixture.detectChanges();
  discardPeriodicTasks();
}

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent> | undefined;

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
  });

  describe('role-gated navigation', () => {
    // Each row is the RBAC-visible surface for that role: what nav must appear
    // and what must never appear. Substrings are chosen to be unambiguous
    // ("Audit" only matches "Audit & Integrity"; no label contains "Post"/"Admin"
    // except its own link).
    const CASES: { role: Role; present: string[]; absent: string[] }[] = [
      {
        role: 'viewer',
        present: ['Ledger'],
        absent: ['Post', 'Audit', 'Point-in-time', 'Admin'],
      },
      {
        role: 'auditor',
        present: ['Ledger', 'Audit', 'Point-in-time'],
        absent: ['Post', 'Admin'],
      },
      {
        role: 'accountant',
        present: ['Ledger', 'Post', 'Audit', 'Point-in-time'],
        absent: ['Admin'],
      },
      {
        role: 'admin',
        present: ['Ledger', 'Post', 'Audit', 'Point-in-time', 'Admin'],
        absent: [],
      },
    ];

    CASES.forEach(({ role, present, absent }) => {
      it(`shows exactly the permitted links for ${role}`, () => {
        fixture = render(role);
        const text = navText(fixture);
        present.forEach((label) =>
          expect(text)
            .withContext(`${role} should see "${label}"`)
            .toContain(label),
        );
        absent.forEach((label) =>
          expect(text)
            .withContext(`${role} should NOT see "${label}"`)
            .not.toContain(label),
        );
      });
    });

    it('renders no chrome when unauthenticated', () => {
      fixture = render(null);
      expect(fixture.nativeElement.querySelector('header')).toBeNull();
      expect(fixture.nativeElement.querySelector('nav')).toBeNull();
    });
  });

  describe('integrity badge', () => {
    it('shows "Verified" when the audit chain is valid', fakeAsync(() => {
      fixture = render('admin', { valid: true, brokenAtSeq: null, checked: 3 });
      settleVerifyQuery(fixture);
      const badge = fixture.nativeElement.querySelector(
        '[title="Audit chain verified"]',
      ) as HTMLElement | null;
      expect(badge).withContext('verified badge present').toBeTruthy();
      expect(badge!.textContent).toContain('Verified');
      expect(
        fixture.nativeElement.querySelector('[title="Audit chain broken"]'),
      ).toBeNull();
    }));

    it('shows "Broken" with the offending seq when the chain is invalid', fakeAsync(() => {
      fixture = render('auditor', {
        valid: false,
        brokenAtSeq: '5',
        checked: 5,
      });
      settleVerifyQuery(fixture);
      const badge = fixture.nativeElement.querySelector(
        '[title="Audit chain broken"]',
      ) as HTMLElement | null;
      expect(badge).withContext('broken badge present').toBeTruthy();
      expect(badge!.textContent).toContain('Broken at #5');
      expect(
        fixture.nativeElement.querySelector('[title="Audit chain verified"]'),
      ).toBeNull();
    }));

    it('is hidden for a viewer, who may not see audit', fakeAsync(() => {
      fixture = render('viewer', VALID);
      settleVerifyQuery(fixture);
      expect(
        fixture.nativeElement.querySelector('[title="Audit chain verified"]'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('[title="Audit chain broken"]'),
      ).toBeNull();
    }));
  });
});
