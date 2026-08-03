import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { I18nService } from '../core/i18n.service';
import { CameraPanel } from './camera-panel/camera-panel';
import { MediaLibrary } from './media-library/media-library';
import { VideoFiltersService } from './video-filters.service';
import { VideoPlayer } from './video-player/video-player';
import { VIDEOS_REPOSITORY } from './videos-dashboard.ports';
import type { MediaItem, VideosDashboardData } from './videos-dashboard.models';

@Component({
  selector: 'app-videos-dashboard-page',
  imports: [ButtonModule, CameraPanel, DialogModule, MediaLibrary, VideoPlayer],
  templateUrl: './videos-dashboard-page.html',
  styleUrl: './videos-dashboard-page.scss',
})
export class VideosDashboardPage implements OnDestroy {
  private readonly repository = inject(VIDEOS_REPOSITORY);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService);
  protected readonly filters = inject(VideoFiltersService);
  protected readonly dashboard = signal<VideosDashboardData | null>(null);
  protected readonly loadingError = signal(false);
  protected readonly selectedMedia = signal<MediaItem | null>(null);

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
    this.updatePlayer({ active });
  }

  protected setResolution(resolution: string): void {
    this.updatePlayer({ resolution });
  }

  protected retryLoad(): void {
    void this.loadData();
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
