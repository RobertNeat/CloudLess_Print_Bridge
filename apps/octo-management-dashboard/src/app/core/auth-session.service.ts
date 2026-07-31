import { Injectable, signal } from '@angular/core';

export interface UserSession {
  readonly userId: string;
  readonly displayName: string;
}

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  // Public prototype mode. A future auth adapter can populate this signal after sign-in.
  readonly session = signal<UserSession | null>(null);
  readonly requiresAuthentication = signal(false);
}
