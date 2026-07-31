import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { VideosDashboardData } from './videos-dashboard.models';

@Injectable({ providedIn: 'root' })
export class VideosDashboardDataService {
  private readonly http = inject(HttpClient);

  async load(): Promise<VideosDashboardData> {
    const source = await firstValueFrom(
      this.http.get('/mock-data/videos-dashboard.json', { responseType: 'text' }),
    );
    const parsed: unknown = JSON.parse(source);
    if (!this.isVideosDashboardData(parsed)) {
      throw new Error('Mock videos dashboard data has an invalid shape.');
    }
    return structuredClone(parsed);
  }

  private isVideosDashboardData(value: unknown): value is VideosDashboardData {
    if (!value || typeof value !== 'object') return false;
    const data = value as Partial<VideosDashboardData>;
    return (
      Array.isArray(data.metrics) &&
      Array.isArray(data.sources) &&
      Array.isArray(data.media) &&
      !!data.player &&
      Array.isArray(data.player.availableResolutions)
    );
  }
}
