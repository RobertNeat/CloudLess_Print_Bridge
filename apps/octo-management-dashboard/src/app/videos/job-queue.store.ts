import { Injectable, computed, inject, signal } from '@angular/core';
import { JobQueueApiService } from './backend/job-queue-api.service';
import type { JobDto } from './backend/job-queue.models';

/**
 * Holds the camera-command job queue polled from the hub (GET /api/v1/jobs),
 * shared between the queue icon/popover (VideoSearch) and the page-owned
 * poll loop (VideosDashboardPage), matching the VideoFiltersService pattern
 * of a root-provided signal store rather than component-local state.
 *
 * Always fetches the *unfiltered* list -- the popover's per-camera filter is
 * a client-side computed() over this store, so a single poll loop covers
 * both the badge count (all cameras) and the filtered list view.
 */
@Injectable({ providedIn: 'root' })
export class JobQueueStore {
  private readonly api = inject(JobQueueApiService);
  private readonly jobsState = signal<readonly JobDto[]>([]);
  private readonly panelOpenState = signal(false);

  readonly jobs = this.jobsState.asReadonly();
  readonly panelOpen = this.panelOpenState.asReadonly();

  /** Active (queued or running) jobs across all cameras -- drives the icon badge even while the popover is closed. */
  readonly activeCount = computed(
    () =>
      this.jobsState().filter((job) => job.status === 'queued' || job.status === 'running').length,
  );

  setPanelOpen(open: boolean): void {
    this.panelOpenState.set(open);
  }

  jobsFor(cameraId: string): readonly JobDto[] {
    const jobs = cameraId
      ? this.jobsState().filter((job) => job.cameraId === cameraId)
      : this.jobsState();
    return sortJobs(jobs);
  }

  async refresh(): Promise<void> {
    try {
      const jobs = await this.api.list();
      this.jobsState.set(jobs);
    } catch {
      // Transient polling failures are not surfaced -- the next tick retries.
    }
  }

  /** Cancels a queued job. A 409 (promoted to running right as the user clicked) or 404 (already finished/pruned) is treated as a benign race -- just refetch so the list reflects reality. */
  async cancel(requestId: string): Promise<void> {
    try {
      await this.api.cancel(requestId);
    } catch {
      // Fall through to refresh either way.
    }
    await this.refresh();
  }

  findByRequestId(requestId: string): JobDto | undefined {
    return this.jobsState().find((job) => job.requestId === requestId);
  }
}

/** Running job first, then queued jobs in queue (createdAt) order. Terminal jobs are omitted -- they're only visible briefly server-side and have no place in an "active work" list. */
function sortJobs(jobs: readonly JobDto[]): readonly JobDto[] {
  const running = jobs.filter((job) => job.status === 'running');
  const queued = [...jobs.filter((job) => job.status === 'queued')].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return [...running, ...queued];
}
