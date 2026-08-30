import { InjectionToken } from '@angular/core';
import type { AuthMode } from './auth-session.service';

export interface CloudlessAuthFrontendConfig {
  readonly mode: AuthMode;
  readonly authKey?: string;
  readonly userId: string;
  readonly displayName: string;
  readonly serviceOrder: readonly string[];
  readonly serviceUrls: Readonly<Record<string, string>>;
}

declare global {
  interface Window {
    __CLOUDLESS_AUTH__?: Partial<CloudlessAuthFrontendConfig>;
  }
}

export const CLOUDLESS_AUTH_CONFIG = new InjectionToken<CloudlessAuthFrontendConfig>(
  'CLOUDLESS_AUTH_CONFIG',
  {
    providedIn: 'root',
    factory: () => {
      const runtime = window.__CLOUDLESS_AUTH__ ?? {};
      return {
        mode: runtime.mode ?? 'disabled',
        authKey: runtime.authKey ?? localStorage.getItem('cloudless.authKey') ?? undefined,
        userId: runtime.userId ?? localStorage.getItem('cloudless.userId') ?? 'local-user',
        displayName:
          runtime.displayName ?? localStorage.getItem('cloudless.displayName') ?? 'Local User',
        serviceOrder: runtime.serviceOrder ?? [
          'mqtt-puppeteer',
          'ftps-remote-manager',
          'video-service-hub',
        ],
        serviceUrls: runtime.serviceUrls ?? {
          'mqtt-puppeteer': 'http://localhost:10220',
          'ftps-remote-manager': 'http://localhost:10221',
          'video-service-hub': 'http://localhost:10222',
        },
      };
    },
  },
);
