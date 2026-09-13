import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { VideoServiceHubConfig } from './video-service-hub.config';

export type CameraRegistryInput = {
  readonly cameraId: string;
  readonly baseUrl: string;
  readonly displayName?: string;
};

/**
 * Minimal write-side client for video-service-hub's camera registry. This is
 * the simple entry point the frontend exposes for adding a camera address —
 * kept out of VideosRepositoryPort so the mock data service (the fallback
 * port implementation) is unaffected.
 */
@Injectable({ providedIn: 'root' })
export class CameraRegistryApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(VideoServiceHubConfig);

  async register(input: CameraRegistryInput): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.config.baseUrl}/api/v1/camera-registry/${encodeURIComponent(input.cameraId)}`,
        { baseUrl: input.baseUrl, displayName: input.displayName },
      ),
    );
  }
}
