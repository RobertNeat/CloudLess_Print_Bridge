import { InjectionToken, inject } from '@angular/core';
import { VideosDashboardDataService } from './videos-dashboard-data.service';
import type { CameraSource, VideosDashboardData } from './videos-dashboard.models';

export interface VideosRepositoryPort {
  load(): Promise<VideosDashboardData>;
  /** Lighter refresh for status polling. Mock port returns the sources unchanged. */
  refreshSources(): Promise<readonly CameraSource[]>;
}

export const VIDEOS_REPOSITORY = new InjectionToken<VideosRepositoryPort>('VIDEOS_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(VideosDashboardDataService),
});
