import { Component, computed, inject, signal } from '@angular/core';
import { CameraPanel } from './camera-panel/camera-panel';
import { MediaLibrary } from './media-library/media-library';
import { VideoFiltersService } from './video-filters.service';
import { VideoPlayer } from './video-player/video-player';
import { VideosDashboardDataService } from './videos-dashboard-data.service';
import type { MediaItem, VideosDashboardData } from './videos-dashboard.models';

@Component({
  selector: 'app-videos-dashboard-page',
  imports: [CameraPanel, MediaLibrary, VideoPlayer],
  templateUrl: './videos-dashboard-page.html',
  styleUrl: './videos-dashboard-page.scss',
})
export class VideosDashboardPage {
  private readonly dataService = inject(VideosDashboardDataService);
  protected readonly filters = inject(VideoFiltersService);
  protected readonly dashboard = signal<VideosDashboardData | null>(null);
  protected readonly loadingError = signal(false);

  protected readonly filteredMedia = computed(() => {
    const items = this.dashboard()?.media ?? [];
    const query = this.filters.query().trim().toLocaleLowerCase('pl');
    const date = this.filters.date();
    const sourceId = this.filters.sourceId();
    return items.filter((item) =>
      (!query || item.name.toLocaleLowerCase('pl').includes(query)) &&
      (!date || item.capturedAt.slice(0, 10) === date) &&
      (!sourceId || item.sourceId === sourceId),
    );
  });

  constructor() {
    void this.loadData();
  }

  protected updatePlayer(change: Partial<VideosDashboardData['player']>): void {
    this.dashboard.update((data) => data ? { ...data, player: { ...data.player, ...change } } : data);
  }

  protected openMedia(item: MediaItem): void {
    this.filters.query.set(item.name);
  }

  private async loadData(): Promise<void> {
    try {
      const data = await this.dataService.load();
      this.dashboard.set(data);
      this.filters.setSources(data.sources.map(({ id, name }) => ({ id, name })));
    } catch {
      this.loadingError.set(true);
    }
  }
}
