import { inject, Injectable, InjectionToken, signal, type Signal } from '@angular/core';

export type AuthMode = 'disabled' | 'optional' | 'required';
export type Permission =
  | 'dashboard.view'
  | 'printer.control'
  | 'printer.configure';

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
  factory: () => 'disabled',
});

export const AUTH_SESSION = new InjectionToken<AuthSessionPort>('AUTH_SESSION', {
  providedIn: 'root',
  factory: () => inject(AuthSessionService),
});

@Injectable({ providedIn: 'root' })
export class AuthSessionService implements AuthSessionPort {
  // Development adapter. A real adapter can implement AuthSessionPort without changing consumers.
  readonly session = signal<UserSession | null>(null);
  readonly ready = signal(true);
}

@Injectable({ providedIn: 'root' })
export class AccessPolicy {
  private readonly mode = inject(AUTH_MODE);
  private readonly auth = inject(AUTH_SESSION);

  isReady(): boolean {
    return this.mode === 'disabled' || this.auth.ready();
  }

  can(permission: Permission): boolean {
    if (this.mode === 'disabled') return true;
    const session = this.auth.session();
    if (!session) return this.mode === 'optional';
    return session.permissions.includes(permission);
  }
}
