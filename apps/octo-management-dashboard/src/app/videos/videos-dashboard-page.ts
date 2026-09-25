import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SplitterModule } from 'primeng/splitter';
import { I18nService } from '../core/i18n.service';
import { NotificationService } from '../core/notification.service';
import { CameraCommandApiService } from './backend/camera-command-api.service';
import { CameraRegistryApiService } from './backend/camera-registry-api.service';
import { LiveStreamApiService } from './backend/live-stream-api.service';
import { CameraPanel } from './camera-panel/camera-panel';
import { JobQueueStore } from './job-queue.store';
import { MediaLibrary } from './media-library/media-library';
import { MediaPreview } from './media-preview/media-preview';
import { MediaRecordDialog } from './media-record-dialog/media-record-dialog';
import type {
  MediaRecordAction,
  MediaRecordRequest,
  MediaRecordSourceOption,
} from './media-record-dialog/media-record-dialog.models';
import { VideoFiltersService } from './video-filters.service';
import { VideoPlayer } from './video-player/video-player';
import { VIDEOS_REPOSITORY } from './videos-dashboard.ports';
import type { CameraSource, MediaItem, VideosDashboardData } from './videos-dashboard.models';

const SOURCE_POLL_INTERVAL_MS = 10_000;
/**
 * Job-queue poll cadence while the popover is open or jobs are active — fast
 * enough to feel live without hammering the hub. While the popover is closed
 * and nothing is active, polling is skipped entirely (see the tick logic in
 * the constructor) rather than merely slowed, since there's nothing to show.
 */
const JOB_POLL_INTERVAL_MS = 2500;

@Component({
  selector: 'app-videos-dashboard-page',
  imports: [
    ButtonModule,
    CameraPanel,
    DialogModule,
    FormsModule,
    InputTextModule,
    MediaLibrary,
    MediaPreview,
    MediaRecordDialog,
    SplitterModule,
    VideoPlayer,
  ],
  templateUrl: './videos-dashboard-page.html',
  styleUrl: './videos-dashboard-page.scss',
})
export class VideosDashboardPage implements OnDestroy {
  private readonly repository = inject(VIDEOS_REPOSITORY);
  private readonly cameraCommands = inject(CameraCommandApiService);
  private readonly cameraRegistry = inject(CameraRegistryApiService);
  private readonly liveStream = inject(LiveStreamApiService);
  private readonly notifications = inject(NotificationService);
  protected readonly jobQueue = inject(JobQueueStore);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService);
  protected readonly filters = inject(VideoFiltersService);
  protected readonly dashboard = signal<VideosDashboardData | null>(null);
  protected readonly loadingError = signal(false);
  protected readonly streamCommandError = signal(false);
  protected readonly streamStarting = signal(false);
  protected readonly selectedMedia = signal<MediaItem | null>(null);
  protected readonly addCameraOpen = signal(false);
  protected readonly addCameraError = signal(false);
  protected readonly addCameraSubmitting = signal(false);
  /** Non-null while the add/edit dialog is editing an existing camera (holds its cameraId); null means add mode. */
  protected readonly editingCameraId = signal<string | null>(null);
  protected readonly newCameraId = signal('');
  protected readonly newCameraBaseUrl = signal('');
  protected readonly newCameraDisplayName = signal('');
  protected readonly newCameraLocation = signal('');
  protected readonly recordDialogAction = signal<MediaRecordAction | null>(null);
  /**
   * The tokened live-stream URL for the currently-active preview, resolved
   * once start-live has actually been dispatched (see applyStreamActive) —
   * the hub's `/api/v1/live/{cameraId}/{requestId}/stream` route needs a
   * requestId that doesn't exist before then, so this can't be precomputed
   * per source.
   */
  protected readonly liveStreamUrl = signal('');
  private activeLiveRequestId: string | null = null;
  private readonly sourcePollHandle: ReturnType<typeof setInterval>;
  private readonly jobPollHandle: ReturnType<typeof setInterval>;
  /** requestIds whose completion (done job -> refreshMedia) has already been handled, so a stale/repeated poll tick doesn't refresh media over and over. Cleared once a requestId leaves the store entirely (terminal grace period elapsed). */
  private readonly handledJobRequestIds = new Set<string>();

  protected readonly selectedSource = computed(() => {
    const data = this.dashboard();
    return data?.sources.find((source) => source.id === data.player.selectedSourceId) ?? null;
  });

  protected readonly canStartStream = computed(
    () => this.selectedSource()?.status === 'online' && !!this.selectedSource()?.commandBaseUrl,
  );

  protected readonly hasCommandableSource = computed(() =>
    (this.dashboard()?.sources ?? []).some((source) => isCommandable(source)),
  );

  protected readonly recordDialogSources = computed<readonly MediaRecordSourceOption[]>(() =>
    (this.dashboard()?.sources ?? []).map((source) => ({
      id: source.id,
      name: source.name,
      commandable: isCommandable(source),
    })),
  );

  protected readonly filteredMedia = computed(() => {
    const items = this.dashboard()?.media ?? [];
    const query = this.filters.query().trim().toLocaleLowerCase(this.i18n.language());
    const date = this.filters.date();
    const sourceId = this.filters.sourceId();
    return items.filter(
      (item) =>
        (!query || item.name.toLocaleLowerCase(this.i18n.language()).includes(query)) &&
        (!date || item.capturedAt.slice(0, 10) === date) &&
        (!sourceId || item.sourceId === sourceId),
    );
  });

  constructor() {
    void this.loadData();
    this.sourcePollHandle = setInterval(() => void this.refreshSources(), SOURCE_POLL_INTERVAL_MS);
    this.jobPollHandle = setInterval(() => void this.pollJobsTick(), JOB_POLL_INTERVAL_MS);
    void this.pollJobsTick();
  }

  ngOnDestroy(): void {
    this.filters.reset();
    clearInterval(this.sourcePollHandle);
    clearInterval(this.jobPollHandle);
  }

  /**
   * Skips the fetch entirely (not just slows it) while the popover is closed
   * and there's nothing active — the badge only needs to update once
   * something *becomes* active, which a job-in-flight guarantees eventually
   * happens on a subsequent tick anyway (dispatchRecordRequest also forces
   * one immediate refresh right after a command is sent).
   */
  private async pollJobsTick(): Promise<void> {
    if (!this.jobQueue.panelOpen() && this.jobQueue.activeCount() === 0) return;
    await this.jobQueue.refresh();
    if (this.destroyRef.destroyed) return;
    this.reactToJobCompletions();
  }

  /**
   * Detects jobs that finished since the last poll (status 'done', not yet
   * handled) and triggers a media refresh so the grid updates without the
   * old per-request pollForMedia() loop. A job leaving the store entirely
   * (terminal grace period elapsed) also clears its handled-marker so the
   * set doesn't grow unbounded.
   */
  private reactToJobCompletions(): void {
    const seen = new Set<string>();
    let shouldRefreshMedia = false;
    for (const job of this.jobQueue.jobs()) {
      seen.add(job.requestId);
      if (job.status === 'done' && !this.handledJobRequestIds.has(job.requestId)) {
        this.handledJobRequestIds.add(job.requestId);
        shouldRefreshMedia = true;
      }
    }
    for (const requestId of [...this.handledJobRequestIds]) {
      if (!seen.has(requestId)) this.handledJobRequestIds.delete(requestId);
    }
    if (shouldRefreshMedia) void this.refreshMedia();
  }

  protected openMedia(item: MediaItem): void {
    this.selectedMedia.set(item);
  }

  protected closeMedia(): void {
    this.selectedMedia.set(null);
  }

  protected onMediaChanged(): void {
    this.selectedMedia.set(null);
    void this.refreshMedia();
  }

  private async refreshMedia(): Promise<void> {
    try {
      const media = await this.repository.refreshMedia();
      if (this.destroyRef.destroyed) return;
      this.dashboard.update((data) => (data ? { ...data, media: [...media] } : data));
      this.loadingError.set(false);
    } catch {
      if (!this.destroyRef.destroyed) this.loadingError.set(true);
    }
  }

  private async refreshSources(): Promise<void> {
    try {
      const sources = await this.repository.refreshSources();
      if (this.destroyRef.destroyed) return;
      this.dashboard.update((data) => (data ? { ...data, sources: [...sources] } : data));
    } catch {
      // Transient polling failures are not surfaced — the next tick retries.
    }
  }

  protected selectSource(sourceId: string): void {
    this.liveStreamUrl.set('');
    this.dashboard.update((data) =>
      data
        ? {
            ...data,
            player: { ...data.player, selectedSourceId: sourceId, active: false },
          }
        : data,
    );
  }

  protected setStreamActive(active: boolean): void {
    if (active && !this.canStartStream()) return;
    void this.applyStreamActive(active);
  }

  /**
   * The <img> for the live view only enters the DOM once player.active is
   * true, and <img> never retries a failed request on its own. So
   * start-live MUST be awaited (and, ideally, actually confirmed running on
   * the camera) before we flip active — otherwise the browser opens the
   * live connection while the camera hasn't started pushing frames yet,
   * gets a 404, and the image stays broken even after the stream comes up a
   * moment later. See VideoPlayer's own retry-on-error for the remaining
   * timing slop (accepted != actively streaming yet).
   */
  private async applyStreamActive(active: boolean): Promise<void> {
    const source = this.selectedSource();
    if (!source?.commandBaseUrl) {
      this.updatePlayer({ active });
      return;
    }
    this.streamCommandError.set(false);
    if (active) this.streamStarting.set(true);
    try {
      if (active) {
        const requestId = `live-${source.id}-${Date.now()}`;
        this.activeLiveRequestId = requestId;
        await this.cameraCommands.startLive(
          source.id,
          source.commandBaseUrl,
          this.dashboard()?.player.resolution ?? 'VGA',
          requestId,
        );
        // Only now does the hub's /api/v1/live/{cameraId}/{requestId}/stream
        // route resolve to anything — see LiveStreamApiService's doc comment.
        const streamUrl = await this.liveStream.buildStreamUrl(source.id, requestId);
        if (!this.destroyRef.destroyed) this.liveStreamUrl.set(streamUrl);
      } else if (this.activeLiveRequestId) {
        await this.cameraCommands.stopLive(
          source.id,
          source.commandBaseUrl,
          this.activeLiveRequestId,
        );
        this.activeLiveRequestId = null;
        this.liveStreamUrl.set('');
      }
      if (!this.destroyRef.destroyed) this.updatePlayer({ active });
    } catch {
      if (!this.destroyRef.destroyed) this.streamCommandError.set(true);
    } finally {
      if (!this.destroyRef.destroyed) this.streamStarting.set(false);
    }
  }

  protected setResolution(resolution: string): void {
    this.updatePlayer({ resolution });
  }

  protected openRecordDialog(action: MediaRecordAction): void {
    this.recordDialogAction.set(action);
  }

  protected closeRecordDialog(): void {
    this.recordDialogAction.set(null);
  }

  protected submitRecordDialog(request: MediaRecordRequest): void {
    this.recordDialogAction.set(null);
    const source = this.dashboard()?.sources.find((candidate) => candidate.id === request.sourceId);
    if (!source?.commandBaseUrl) return;
    void this.dispatchRecordRequest(source, request);
  }

  /**
   * Dispatches the camera command and immediately returns — no client-side
   * pending/spinner lock and no polling-for-completion here anymore. The
   * backend's own per-camera job queue (see JobRegistryService in
   * video-service-hub) now serializes concurrent requests for the same
   * camera, so the same action/source can be triggered again right away; the
   * new job-queue popover (JobQueueStore, surfaced via VideoSearch) is where
   * the user tracks in-flight/queued work, and reactToJobCompletions() is
   * what refreshes the media grid once a job finishes.
   */
  private async dispatchRecordRequest(
    source: CameraSource,
    request: MediaRecordRequest,
  ): Promise<void> {
    if (!source.commandBaseUrl) return;
    const action = request.action;
    const requestId = `${requestIdPrefix(action)}-${source.id}-${Date.now()}`;
    try {
      await this.dispatchCommand(source.id, source.commandBaseUrl, request, requestId);
      if (this.destroyRef.destroyed) return;
      await this.notifyQueued(requestId);
    } catch {
      if (!this.destroyRef.destroyed) this.notifications.error('videos.record.commandError');
    }
  }

  /**
   * Looks up the just-dispatched job by requestId to grab its
   * expectedFileName for the toast — the job is registered synchronously by
   * JobRegistryService.enqueue() before the command POST even resolves, so a
   * single refresh right after dispatch is enough to find it. Falls back to
   * a generic message if the lookup fails or the job isn't found (e.g. an
   * untracked command, or it already finished+got pruned in the interim).
   */
  private async notifyQueued(requestId: string): Promise<void> {
    await this.jobQueue.refresh();
    if (this.destroyRef.destroyed) return;
    this.reactToJobCompletions();
    const job = this.jobQueue.findByRequestId(requestId);
    if (job?.expectedFileName) {
      this.notifications.info('videos.record.queued', { fileName: job.expectedFileName }, 4000);
    } else {
      this.notifications.info('videos.record.queuedGeneric', undefined, 4000);
    }
  }

  private dispatchCommand(
    cameraId: string,
    cameraBaseUrl: string,
    request: MediaRecordRequest,
    requestId: string,
  ): Promise<void> {
    switch (request.action) {
      case 'capture':
        return this.cameraCommands.captureImage(
          cameraId,
          cameraBaseUrl,
          request.resolution,
          requestId,
        );
      case 'timelapse':
        return this.cameraCommands.startTimelapse(
          cameraId,
          cameraBaseUrl,
          request.resolution,
          request.intervalSeconds * 1000,
          request.durationSeconds * 1000,
          requestId,
        );
      case 'recording':
        return this.cameraCommands.startTimedRecording(
          cameraId,
          cameraBaseUrl,
          request.resolution,
          request.durationSeconds * 1000,
          requestId,
        );
      case 'audio':
        return this.cameraCommands.recordAudio(
          cameraId,
          cameraBaseUrl,
          request.durationSeconds,
          requestId,
        );
    }
  }

  protected retryLoad(): void {
    void this.loadData();
  }

  protected openAddCamera(): void {
    this.editingCameraId.set(null);
    this.newCameraId.set('');
    this.newCameraBaseUrl.set('');
    this.newCameraDisplayName.set('');
    this.newCameraLocation.set('');
    this.addCameraError.set(false);
    this.addCameraOpen.set(true);
  }

  protected async openEditCamera(sourceId: string): Promise<void> {
    // Prefill from the raw registry entry (not the mapped CameraSource) —
    // CameraSource.name falls back to cameraId when displayName is unset, so
    // prefilling from it would write the cameraId back as the display name.
    let baseUrl = '';
    let displayName = '';
    let locationCode = '';
    try {
      const entries = await this.cameraRegistry.list();
      const entry = entries.find((candidate) => candidate.cameraId === sourceId);
      if (entry) {
        baseUrl = entry.baseUrl;
        displayName = entry.displayName ?? '';
        locationCode = entry.locationCode ?? '';
      }
    } catch {
      const source = this.dashboard()?.sources.find((candidate) => candidate.id === sourceId);
      baseUrl = source?.commandBaseUrl ?? '';
      locationCode = source?.locationCode ?? '';
    }
    if (this.destroyRef.destroyed) return;
    this.editingCameraId.set(sourceId);
    this.newCameraId.set(sourceId);
    this.newCameraBaseUrl.set(baseUrl);
    this.newCameraDisplayName.set(displayName);
    this.newCameraLocation.set(locationCode);
    this.addCameraError.set(false);
    this.addCameraOpen.set(true);
  }

  protected closeAddCamera(): void {
    this.addCameraOpen.set(false);
    this.editingCameraId.set(null);
  }

  protected canSubmitAddCamera(): boolean {
    return this.newCameraId().trim().length > 0 && this.newCameraBaseUrl().trim().length > 0;
  }

  protected async submitCameraForm(): Promise<void> {
    if (!this.canSubmitAddCamera() || this.addCameraSubmitting()) return;
    this.addCameraSubmitting.set(true);
    this.addCameraError.set(false);
    const editingId = this.editingCameraId();
    try {
      if (editingId) {
        await this.cameraRegistry.update(editingId, {
          baseUrl: this.newCameraBaseUrl().trim(),
          displayName: this.newCameraDisplayName().trim(),
          locationCode: this.newCameraLocation().trim(),
        });
      } else {
        await this.cameraRegistry.register({
          cameraId: this.newCameraId().trim(),
          baseUrl: this.newCameraBaseUrl().trim(),
          displayName: this.newCameraDisplayName().trim() || undefined,
          locationCode: this.newCameraLocation().trim() || undefined,
        });
      }
      if (this.destroyRef.destroyed) return;
      this.addCameraOpen.set(false);
      this.editingCameraId.set(null);
      await this.loadData();
    } catch {
      if (!this.destroyRef.destroyed) this.addCameraError.set(true);
    } finally {
      if (!this.destroyRef.destroyed) this.addCameraSubmitting.set(false);
    }
  }

  protected async removeCamera(sourceId: string): Promise<void> {
    try {
      await this.cameraRegistry.remove(sourceId);
      if (this.destroyRef.destroyed) return;
      if (this.selectedSource()?.id === sourceId) this.liveStreamUrl.set('');
      await this.loadData();
    } catch {
      if (!this.destroyRef.destroyed) this.notifications.error('videos.removeCamera.error');
    }
  }

  private async loadData(): Promise<void> {
    this.loadingError.set(false);
    try {
      const data = await this.repository.load();
      if (this.destroyRef.destroyed) return;
      this.dashboard.set(data);
      this.filters.setSources(data.sources.map(({ id, name }) => ({ id, name })));
    } catch {
      if (!this.destroyRef.destroyed) this.loadingError.set(true);
    }
  }

  private updatePlayer(change: Partial<VideosDashboardData['player']>): void {
    this.dashboard.update((data) =>
      data ? { ...data, player: { ...data.player, ...change } } : data,
    );
  }
}

function isCommandable(source: CameraSource): boolean {
  return source.status === 'online' && !!source.commandBaseUrl;
}

function requestIdPrefix(action: MediaRecordAction): string {
  switch (action) {
    case 'capture':
      return 'capture';
    case 'timelapse':
      return 'timelapse';
    case 'recording':
      return 'recording';
    case 'audio':
      return 'audio';
  }
}
