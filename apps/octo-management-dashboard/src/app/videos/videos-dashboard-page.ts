import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SplitterModule } from 'primeng/splitter';
import { I18nService, type TranslationKey } from '../core/i18n.service';
import { NotificationService } from '../core/notification.service';
import { CameraCommandApiService } from './backend/camera-command-api.service';
import { CameraRegistryApiService } from './backend/camera-registry-api.service';
import { LiveStreamApiService } from './backend/live-stream-api.service';
import { CameraPanel } from './camera-panel/camera-panel';
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
const MEDIA_POLL_INTERVAL_MS = 2000;
/** Extra slack on top of the requested action duration, to cover transcode/upload/network latency after the camera stops recording. */
const MEDIA_POLL_SLACK_MS = 15_000;
/** Capture has no duration of its own — just enough for the camera to shoot and upload one frame, plus slack for real-hardware latency observed in practice. */
const CAPTURE_POLL_TIMEOUT_MS = 30_000;

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
  protected readonly pendingActions = signal<ReadonlySet<MediaRecordAction>>(new Set());
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
  }

  ngOnDestroy(): void {
    this.filters.reset();
    clearInterval(this.sourcePollHandle);
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
    if (this.pendingActions().has(action)) return;
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
   * Dispatches the camera command, then polls refreshMedia() for the file
   * this specific request produced (matched by requestId, which round-trips
   * from client-generated id -> command payload -> stored media item) rather
   * than guessing a fixed timer — the earlier `setTimeout(loadData, duration
   * + slack)` approach both raced real encode/upload latency and blew away
   * the live player/selected-source state on every capture via the full
   * reload. The button's own spinner (pendingActions) clears only once the
   * file is actually observed, or the poll times out with an error toast.
   */
  private async dispatchRecordRequest(
    source: CameraSource,
    request: MediaRecordRequest,
  ): Promise<void> {
    if (!source.commandBaseUrl) return;
    const action = request.action;
    const requestId = `${requestIdPrefix(action)}-${source.id}-${Date.now()}`;
    this.setPending(action, true);
    try {
      await this.dispatchCommand(source.id, source.commandBaseUrl, request, requestId);
      const found = await this.pollForMedia(requestId, pollTimeoutMs(request));
      if (this.destroyRef.destroyed) return;
      if (found) {
        this.notifications.info(startedMessageKey(action));
      } else {
        this.notifications.warn('videos.record.timedOut');
      }
    } catch {
      if (!this.destroyRef.destroyed) this.notifications.error('videos.record.commandError');
    } finally {
      if (!this.destroyRef.destroyed) this.setPending(action, false);
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

  /** Polls refreshMedia() until an item with this requestId shows up, or the timeout elapses. Merges into `dashboard` as it goes so the grid updates the moment the file appears, same as any other successful refresh. */
  private async pollForMedia(requestId: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.destroyRef.destroyed) return false;
      let media: readonly MediaItem[];
      try {
        media = await this.repository.refreshMedia();
      } catch {
        media = [];
      }
      if (this.destroyRef.destroyed) return false;
      const found = media.some((item) => item.requestId === requestId);
      if (found || media.length > 0) {
        this.dashboard.update((data) => (data ? { ...data, media: [...media] } : data));
        this.loadingError.set(false);
      }
      if (found) return true;
      if (Date.now() >= deadline) return false;
      await delay(Math.min(MEDIA_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    }
  }

  private setPending(action: MediaRecordAction, pending: boolean): void {
    this.pendingActions.update((current) => {
      const next = new Set(current);
      if (pending) next.add(action);
      else next.delete(action);
      return next;
    });
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

function pollTimeoutMs(request: MediaRecordRequest): number {
  switch (request.action) {
    case 'capture':
      return CAPTURE_POLL_TIMEOUT_MS;
    case 'timelapse':
      return request.durationSeconds * 1000 + MEDIA_POLL_SLACK_MS;
    case 'recording':
      return request.durationSeconds * 1000 + MEDIA_POLL_SLACK_MS;
    case 'audio':
      return request.durationSeconds * 1000 + MEDIA_POLL_SLACK_MS;
  }
}

function startedMessageKey(action: MediaRecordAction): TranslationKey {
  switch (action) {
    case 'capture':
      return 'videos.record.captureStarted';
    case 'timelapse':
      return 'videos.record.timelapseStarted';
    case 'recording':
      return 'videos.record.recordingStarted';
    case 'audio':
      return 'videos.record.audioStarted';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
