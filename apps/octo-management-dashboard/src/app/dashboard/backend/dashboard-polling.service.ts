import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MqttPuppeteerConfig } from './mqtt-puppeteer.config';
import type { PrinterDomainModelDto } from './mqtt-puppeteer-api.types';

const DEFAULT_POLL_INTERVAL_MS = 2_000;

/**
 * Polls GET /device_config/state/domain on a fixed interval. This is the
 * chosen live-data strategy over Socket.IO for the first integration pass:
 * ManagementDashboardDataSource.load() is a pull Promise interface and
 * socket.io-client isn't installed anywhere in this app yet, so polling
 * needs zero new dependencies. Switching to a push transport later is a
 * moderate refactor (this service would need to expose an Observable
 * instead of a signal), not a config flip — noted here deliberately so it
 * isn't mistaken for a drop-in swap.
 */
@Injectable({ providedIn: 'root' })
export class DashboardPollingService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(MqttPuppeteerConfig);

  readonly latestDomainState = signal<PrinterDomainModelDto | null>(null);

  private timer: ReturnType<typeof setInterval> | null = null;

  start(intervalMs = DEFAULT_POLL_INTERVAL_MS): void {
    if (this.timer !== null) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    try {
      const state = await firstValueFrom(
        this.http.get<PrinterDomainModelDto>(`${this.config.baseUrl}/device_config/state/domain`),
      );
      this.latestDomainState.set(state);
    } catch {
      // A failed poll tick is not surfaced as a command error — it's a
      // background refresh, not a user-initiated action. The next tick
      // will retry. Command failures are reported through runCommand().
    }
  }
}

/**
 * Tracks a short suppression window per field after an optimistic local
 * patch, so the very next poll tick (which may read backend state that
 * hasn't physically caught up yet — e.g. a fan not yet at target speed)
 * doesn't visibly snap the UI back to a stale value.
 */
export class PollSuppressionWindow {
  private readonly suppressedUntil = new Map<string, number>();

  constructor(private readonly windowMs = 4_000) {}

  suppress(field: string): void {
    this.suppressedUntil.set(field, Date.now() + this.windowMs);
  }

  isSuppressed(field: string): boolean {
    const expiry = this.suppressedUntil.get(field);
    if (expiry === undefined) return false;
    if (Date.now() >= expiry) {
      this.suppressedUntil.delete(field);
      return false;
    }
    return true;
  }
}
