import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../api/auth.api';
import { Credentials, Role, User } from '../models/auth.models';

const TOKEN_KEY = 'keepsake_token';

/** Client-side auth/session state, held in Angular signals. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
  private readonly _token = signal<string | null>(
    localStorage.getItem(TOKEN_KEY),
  );
  readonly currentUser = signal<User | null>(null);
  readonly isAuthenticated = computed(() => !!this._token());

  token(): string | null {
    return this._token();
  }

  /** APP_INITIALIZER: if a token exists, load the user (clear it on failure). */
  async init(): Promise<void> {
    if (!this._token()) return;
    try {
      this.currentUser.set(await firstValueFrom(this.api.me()));
    } catch {
      this.clear();
    }
  }

  async login(creds: Credentials): Promise<void> {
    const { accessToken } = await firstValueFrom(this.api.login(creds));
    this._token.set(accessToken);
    localStorage.setItem(TOKEN_KEY, accessToken);
    this.currentUser.set(await firstValueFrom(this.api.me()));
  }

  logout(): void {
    this.clear();
  }

  hasRole(...roles: Role[]): boolean {
    const u = this.currentUser();
    return !!u && roles.includes(u.role);
  }

  private clear(): void {
    this._token.set(null);
    this.currentUser.set(null);
    localStorage.removeItem(TOKEN_KEY);
  }
}
