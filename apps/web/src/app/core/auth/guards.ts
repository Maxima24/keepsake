import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../models/auth.models';
import { AuthStore } from './auth.store';

export const authGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  return store.isAuthenticated() ? true : router.parseUrl('/login');
};

/** Allow only the given roles; otherwise bounce to the always-permitted Ledger. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const store = inject(AuthStore);
    const router = inject(Router);
    if (!store.isAuthenticated()) return router.parseUrl('/login');
    return store.hasRole(...roles) ? true : router.parseUrl('/ledger');
  };
}
