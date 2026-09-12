import { inject, Injectable, signal } from '@angular/core';
import { TelemetryHistoryService } from './telemetry-history.service';
import type { TelemetryHistoryResponseDto } from './mqtt-puppeteer-api.types';

const DEFAULT_TELEMETRY_POLL_INTERVAL_MS = 8_000;

/**
 * Separate from DashboardPollingService: telemetry history is a full sample
 * buffer, more expensive to fetch and refresh than a single domain-state
 * read, so it runs on its own longer interval instead of piggybacking on
 * the 2s domain-state poll.
 */
@Injectable({ providedIn: 'root' })
export class TelemetryPollingService {
  private readonly telemetry = inject(TelemetryHistoryService);

  readonly latestHistory = signal<TelemetryHistoryResponseDto | null>(null);

  private timer: ReturnType<typeof setInterval> | null = null;

  start(intervalMs = DEFAULT_TELEMETRY_POLL_INTERVAL_MS): void {
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
      this.latestHistory.set(await this.telemetry.fetchHistory());
    } catch {
      // Same rationale as DashboardPollingService: a failed background
      // refresh isn't a user-facing command error, just retry next tick.
    }
  }
}
