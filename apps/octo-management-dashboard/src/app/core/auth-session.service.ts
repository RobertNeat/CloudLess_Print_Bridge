import { computed, inject, Injectable, InjectionToken, signal, type Signal } from '@angular/core';
import { CLOUDLESS_AUTH_CONFIG } from './cloudless-auth.config';

export type AuthMode = 'disabled' | 'optional' | 'required';
export type Permission =
  | 'dashboard.view'
  | 'printer.control'
  | 'printer.configure'
  | 'files.read'
  | 'files.upload'
  | 'files.download'
  | 'files.manage';

export interface UserSession {
  readonly userId: string;
  readonly displayName: string;
  readonly permissions: readonly Permission[];
}

export interface AuthSessionPort {
  readonly session: Signal<UserSession | null>;
  readonly ready: Signal<boolean>;
}

export const AUTH_MODE = new InjectionToken<AuthMode>('AUTH_MODE', {
  providedIn: 'root',
  factory: () => inject(CLOUDLESS_AUTH_CONFIG).mode,
});

export const AUTH_SESSION = new InjectionToken<AuthSessionPort>('AUTH_SESSION', {
  providedIn: 'root',
  factory: () => inject(AuthSessionService),
});

@Injectable({ providedIn: 'root' })
export class AuthSessionService implements AuthSessionPort {
  private readonly config = inject(CLOUDLESS_AUTH_CONFIG);
  readonly accessToken = signal<string | null>(localStorage.getItem('cloudless.accessToken'));
  readonly session = signal<UserSession | null>(null);
  readonly ready = signal(this.config.mode === 'disabled');

  constructor() {
    if (this.config.mode !== 'disabled') void this.authenticate();
  }

  private async authenticate(): Promise<void> {
    const existingToken = this.accessToken();
    if (existingToken) {
      this.session.set({
        userId: this.config.userId,
        displayName: this.config.displayName,
        permissions: [
          'dashboard.view',
          'printer.control',
          'printer.configure',
          'files.read',
          'files.upload',
          'files.download',
          'files.manage',
        ],
      });
      this.ready.set(true);
      return;
    }

    for (const serviceName of this.config.serviceOrder) {
      const baseUrl = this.config.serviceUrls[serviceName];
      if (!baseUrl) continue;
      const token = await this.tryCreateToken(baseUrl);
      if (!token) continue;
      this.accessToken.set(token.accessToken);
      localStorage.setItem('cloudless.accessToken', token.accessToken);
      this.session.set(token.user);
      this.ready.set(true);
      return;
    }

    this.ready.set(true);
  }

  private async tryCreateToken(
    baseUrl: string,
  ): Promise<{ accessToken: string; user: UserSession } | null> {
    try {
      const response = await fetch(`${baseUrl}/auth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authKey ? { 'x-cloudless-auth-key': this.config.authKey } : {}),
        },
        body: JSON.stringify({
          userId: this.config.userId,
          displayName: this.config.displayName,
        }),
      });
      if (!response.ok) return null;
      return (await response.json()) as { accessToken: string; user: UserSession };
    } catch {
      return null;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class AccessPolicy {
  private readonly mode = inject(AUTH_MODE);
  private readonly auth = inject(AUTH_SESSION);

  readonly ready = computed(() => this.mode === 'disabled' || this.auth.ready());

  isReady(): boolean {
    return this.ready();
  }

  can(permission: Permission): boolean {
    if (this.mode === 'disabled') return true;
    const session = this.auth.session();
    if (!session) return this.mode === 'optional';
    return session.permissions.includes(permission);
  }
}
