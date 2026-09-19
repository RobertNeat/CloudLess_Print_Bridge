import { InjectionToken, inject } from '@angular/core';
import { VideosDashboardDataService } from './videos-dashboard-data.service';
import type { CameraSource, MediaItem, VideosDashboardData } from './videos-dashboard.models';

export interface VideosRepositoryPort {
  load(): Promise<VideosDashboardData>;
  /** Lighter refresh for status polling. Mock port returns the sources unchanged. */
  refreshSources(): Promise<readonly CameraSource[]>;
  /** Lighter refresh after a media rename/delete — re-fetches only the media list, leaving the live player/source selection untouched. */
  refreshMedia(): Promise<readonly MediaItem[]>;
}

export const VIDEOS_REPOSITORY = new InjectionToken<VideosRepositoryPort>('VIDEOS_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(VideosDashboardDataService),
});
