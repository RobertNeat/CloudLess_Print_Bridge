import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  AccessPolicy,
  AUTH_MODE,
  AUTH_SESSION,
  type AuthSessionPort,
} from './auth-session.service';

describe('AccessPolicy', () => {
  it('keeps development unblocked when authentication is disabled', () => {
    TestBed.configureTestingModule({ providers: [AccessPolicy] });
    expect(TestBed.inject(AccessPolicy).can('printer.control')).toBe(true);
  });

  it('enforces permissions when authentication is required', () => {
    const auth: AuthSessionPort = {
      ready: signal(true),
      session: signal({
        userId: 'operator',
        displayName: 'Operator',
        permissions: ['dashboard.view'],
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        AccessPolicy,
        { provide: AUTH_MODE, useValue: 'required' },
        { provide: AUTH_SESSION, useValue: auth },
      ],
    });
    const policy = TestBed.inject(AccessPolicy);
    expect(policy.can('dashboard.view')).toBe(true);
    expect(policy.can('printer.control')).toBe(false);
  });
});
