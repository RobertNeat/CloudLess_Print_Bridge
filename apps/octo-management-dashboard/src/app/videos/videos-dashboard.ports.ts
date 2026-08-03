import { InjectionToken, inject } from '@angular/core';
import { VideosDashboardDataService } from './videos-dashboard-data.service';
import type { VideosDashboardData } from './videos-dashboard.models';

export interface VideosRepositoryPort {
  load(): Promise<VideosDashboardData>;
}

export const VIDEOS_REPOSITORY = new InjectionToken<VideosRepositoryPort>('VIDEOS_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(VideosDashboardDataService),
});
