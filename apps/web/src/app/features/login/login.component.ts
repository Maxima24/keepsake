import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { BrandMarkComponent } from '../../shared/ui/brand-mark.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [BrandMarkComponent, IconComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);

  readonly email = signal('admin@keepsake.local');
  readonly password = signal('password123');
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.store.login({ email: this.email(), password: this.password() });
      const dest = this.store.hasRole('admin', 'accountant') ? '/post' : '/ledger';
      await this.router.navigateByUrl(dest);
    } catch (err: unknown) {
      const e = err as { error?: { message?: string | string[] } };
      const msg = e?.error?.message;
      this.error.set(
        Array.isArray(msg) ? msg.join(' ') : (msg ?? 'Sign in failed.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
