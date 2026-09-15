import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MediaKind } from '../videos-dashboard.models';
import type { BackendCaptureFramesResponse } from './video-api.types';
import { VideoServiceHubConfig } from './video-service-hub.config';

const pathByKind: Record<MediaKind, string> = {
  audio: 'audio',
  recording: 'recordings',
  timelapse: 'captures',
  image: 'captures',
};

/**
 * Rename/delete/frame-listing client for recorded media. Kept separate from
 * VideosRepositoryPort (read-only `load()`) so the mock data service (the
 * fallback port implementation) is unaffected, matching the precedent set by
 * CameraCommandApiService/CameraRegistryApiService.
 */
@Injectable({ providedIn: 'root' })
export class MediaLibraryApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(VideoServiceHubConfig);

  async rename(
    kind: MediaKind,
    cameraId: string,
    requestId: string,
    displayName: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.patch(
        `${this.config.baseUrl}/api/v1/${pathByKind[kind]}/${encodeURIComponent(cameraId)}/${encodeURIComponent(requestId)}`,
        { displayName },
      ),
    );
  }

  async delete(kind: MediaKind, cameraId: string, requestId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(
        `${this.config.baseUrl}/api/v1/${pathByKind[kind]}/${encodeURIComponent(cameraId)}/${encodeURIComponent(requestId)}`,
      ),
    );
  }

  /**
   * Triggers (or, if already done, no-ops on) MP4 transcoding of one
   * recording. transcodeUrl is the absolute URL already mapped onto
   * MediaItem by HttpVideosDataService. Retried a few times with backoff by
   * the caller (media-preview.ts) since first-time encoding can briefly
   * outlast a transient network hiccup.
   */
  async transcode(transcodeUrl: string): Promise<void> {
    await firstValueFrom(this.http.post(transcodeUrl, {}));
  }

  async listCaptureFrames(
    cameraId: string,
    requestId: string,
  ): Promise<BackendCaptureFramesResponse['items']> {
    const response = await firstValueFrom(
      this.http.get<BackendCaptureFramesResponse>(
        `${this.config.baseUrl}/api/v1/captures/${encodeURIComponent(cameraId)}/${encodeURIComponent(requestId)}/frames`,
      ),
    );
    return response.items;
  }
}
