import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { AUTH_MODE, AUTH_SESSION, type UserSession } from './auth-session.service';
import { dashboardAccessGuard } from './dashboard-access.guard';

describe('dashboardAccessGuard', () => {
  it('waits for an asynchronous session before deciding access', async () => {
    const ready = signal(false);
    const session = signal<UserSession | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AUTH_MODE, useValue: 'required' },
        { provide: AUTH_SESSION, useValue: { ready, session } },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      dashboardAccessGuard(
        {
          data: { dashboardId: 'files', permission: 'files.read' },
        } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
    expect(isObservable(result)).toBe(true);
    if (!isObservable(result)) throw new Error('Expected the guard to wait asynchronously.');
    const decision = firstValueFrom(result);
    session.set({ userId: 'operator', displayName: 'Operator', permissions: ['files.read'] });
    ready.set(true);

    expect(await decision).toBe(true);
  });
});
