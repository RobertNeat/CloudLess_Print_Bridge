import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { BackendStreamTokenResponse } from './video-api.types';
import { VideoServiceHubConfig } from './video-service-hub.config';

/**
 * Builds the tokened URL for the live MJPEG stream
 * (`GET /api/v1/live/{cameraId}/{requestId}/stream`, StreamTokenGuard-gated).
 * Unlike the old `/api/v1/cameras/{cameraId}/live` endpoint, the current
 * route is keyed by `requestId` as well as `cameraId` — there is no
 * camera-only "whatever is currently live" URL, since a hub can only tell
 * the stream apart from any past one by the requestId the start-live command
 * carried. That requestId does not exist until the caller has actually
 * dispatched start-live, so this cannot be pre-built at dashboard `load()`
 * time the way the old cameraId-only preview URL was; the caller (currently
 * VideosDashboardPage.applyStreamActive) must call this once it has minted
 * the requestId it is about to send to the camera.
 *
 * Kept separate from VideosRepositoryPort so the mock data service (the
 * fallback port implementation) is unaffected, matching the precedent set by
 * CameraCommandApiService/CameraRegistryApiService/MediaLibraryApiService.
 */
@Injectable({ providedIn: 'root' })
export class LiveStreamApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(VideoServiceHubConfig);

  /**
   * Stream tokens are cached per cameraId for the lifetime of this service (a
   * page load), because issuing a new token for the same (user, camera) pair
   * invalidates the previous one on the backend.
   */
  private readonly streamTokens = new Map<string, string>();

  async buildStreamUrl(cameraId: string, requestId: string): Promise<string> {
    const token = await this.acquireStreamToken(cameraId);
    return `${this.config.baseUrl}/api/v1/live/${encodeURIComponent(cameraId)}/${encodeURIComponent(requestId)}/stream?streamToken=${encodeURIComponent(token)}`;
  }

  private async acquireStreamToken(cameraId: string): Promise<string> {
    const cached = this.streamTokens.get(cameraId);
    if (cached) return cached;
    const response = await firstValueFrom(
      this.http.post<BackendStreamTokenResponse>(`${this.config.baseUrl}/auth/stream-token`, {
        cameraId,
      }),
    );
    this.streamTokens.set(cameraId, response.streamToken);
    return response.streamToken;
  }
}
