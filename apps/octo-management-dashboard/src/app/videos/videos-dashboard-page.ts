import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SplitterModule } from 'primeng/splitter';
import { I18nService } from '../core/i18n.service';
import { CameraCommandApiService } from './backend/camera-command-api.service';
import { CameraRegistryApiService } from './backend/camera-registry-api.service';
import { CameraPanel } from './camera-panel/camera-panel';
import { MediaLibrary } from './media-library/media-library';
import { VideoFiltersService } from './video-filters.service';
import { VideoPlayer } from './video-player/video-player';
import { VIDEOS_REPOSITORY } from './videos-dashboard.ports';
import type { MediaItem, VideosDashboardData } from './videos-dashboard.models';

@Component({
  selector: 'app-videos-dashboard-page',
  imports: [
    ButtonModule,
    CameraPanel,
    DialogModule,
    FormsModule,
    InputTextModule,
    MediaLibrary,
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
  protected readonly newCameraId = signal('');
  protected readonly newCameraBaseUrl = signal('');
  protected readonly newCameraDisplayName = signal('');
  private activeLiveRequestId: string | null = null;

  protected readonly selectedSource = computed(() => {
    const data = this.dashboard();
    return data?.sources.find((source) => source.id === data.player.selectedSourceId) ?? null;
  });

  protected readonly canStartStream = computed(
    () => this.selectedSource()?.status === 'online' && !!this.selectedSource()?.previewUrl,
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
  }

  ngOnDestroy(): void {
    this.filters.reset();
  }

  protected openMedia(item: MediaItem): void {
    this.selectedMedia.set(item);
  }

  protected selectSource(sourceId: string): void {
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
      } else if (this.activeLiveRequestId) {
        await this.cameraCommands.stopLive(
          source.id,
          source.commandBaseUrl,
          this.activeLiveRequestId,
        );
        this.activeLiveRequestId = null;
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

  protected retryLoad(): void {
    void this.loadData();
  }

  protected openAddCamera(): void {
    this.newCameraId.set('');
    this.newCameraBaseUrl.set('');
    this.newCameraDisplayName.set('');
    this.addCameraError.set(false);
    this.addCameraOpen.set(true);
  }

  protected closeAddCamera(): void {
    this.addCameraOpen.set(false);
  }

  protected canSubmitAddCamera(): boolean {
    return this.newCameraId().trim().length > 0 && this.newCameraBaseUrl().trim().length > 0;
  }

  protected async submitAddCamera(): Promise<void> {
    if (!this.canSubmitAddCamera() || this.addCameraSubmitting()) return;
    this.addCameraSubmitting.set(true);
    this.addCameraError.set(false);
    try {
      await this.cameraRegistry.register({
        cameraId: this.newCameraId().trim(),
        baseUrl: this.newCameraBaseUrl().trim(),
        displayName: this.newCameraDisplayName().trim() || undefined,
      });
      if (this.destroyRef.destroyed) return;
      this.addCameraOpen.set(false);
      await this.loadData();
    } catch {
      if (!this.destroyRef.destroyed) this.addCameraError.set(true);
    } finally {
      if (!this.destroyRef.destroyed) this.addCameraSubmitting.set(false);
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
