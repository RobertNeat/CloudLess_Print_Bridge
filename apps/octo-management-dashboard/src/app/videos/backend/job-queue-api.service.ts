import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { JobDto } from './job-queue.models';
import { VideoServiceHubConfig } from './video-service-hub.config';

/**
 * Client for the hub's per-camera job queue (GET /api/v1/jobs, DELETE
 * /api/v1/jobs/:requestId). Kept separate from CameraCommandApiService (which
 * dispatches the commands themselves) matching the precedent set by
 * MediaLibraryApiService/CameraRegistryApiService.
 */
@Injectable({ providedIn: 'root' })
export class JobQueueApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(VideoServiceHubConfig);

  async list(cameraId?: string): Promise<JobDto[]> {
    const params = cameraId ? new HttpParams().set('cameraId', cameraId) : undefined;
    const result = await firstValueFrom(
      this.http.get<{ items: JobDto[] }>(`${this.config.baseUrl}/api/v1/jobs`, { params }),
    );
    return result.items;
  }

  async cancel(requestId: string): Promise<JobDto> {
    return firstValueFrom(
      this.http.delete<JobDto>(
        `${this.config.baseUrl}/api/v1/jobs/${encodeURIComponent(requestId)}`,
      ),
    );
  }
}
