import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MediaKind } from '../videos-dashboard.models';
import { VideoServiceHubConfig } from './video-service-hub.config';

/** Mirrors the hub's per-kind URL segments (media-library.controller.ts in video-service-hub). */
const pathByKind: Record<MediaKind, string> = {
  audio: 'audio',
  recording: 'recordings',
  live: 'live',
  timelapse: 'timelapses',
  image: 'captures',
};

/**
 * Rename/delete client for recorded media. Kept separate from
 * VideosRepositoryPort (read-only `load()`) so the mock data service (the
 * fallback port implementation) is unaffected, matching the precedent set by
 * CameraCommandApiService/CameraRegistryApiService.
 *
 * There is no client-triggered transcode endpoint anymore: the hub
 * transcodes eagerly/synchronously the moment a resource's manifest reports
 * complete (see TranscodingService/CameraIngestController in
 * video-service-hub), so MediaItem.downloadUrl already points at the
 * finished asset by the time it appears in a list response.
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
}
