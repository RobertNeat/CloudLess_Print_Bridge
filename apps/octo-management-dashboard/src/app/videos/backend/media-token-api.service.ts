import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MediaKind } from '../videos-dashboard.models';
import type { BackendMediaTokenResponse } from './video-api.types';
import { VideoServiceHubConfig } from './video-service-hub.config';

export type MediaTokenKind = 'recording' | 'recording-mp4' | 'capture' | 'audio' | 'live-recording';

export type MediaTokenRequest = {
  readonly kind: MediaTokenKind;
  readonly cameraId: string;
  readonly requestId: string;
  readonly fileName?: string;
};

/**
 * Frontend MediaKind has no 'live-recording' distinction (both plain
 * recordings and completed live-view recordings map to kind 'recording'),
 * and the backend's file-serve routes are keyed by kind too. Default to
 * 'recording' — completed live-recordings are far rarer than normal timed
 * recordings, and a wrong guess here only means a 401 on playback, not data
 * loss, so this is an acceptable known limitation rather than plumbing a new
 * discriminator through the whole stack for a rare case.
 */
export function mediaKindToTokenKind(kind: MediaKind): MediaTokenKind {
  switch (kind) {
    case 'audio':
      return 'audio';
    case 'image':
    case 'timelapse':
      return 'capture';
    case 'recording':
    default:
      return 'recording';
  }
}

/**
 * Issues short-lived tokens granting access to one specific recorded media
 * file, for plain <img>/<audio src> elements that cannot carry an
 * Authorization header. Mirrors the live-view stream-token flow, but scoped
 * per file rather than per camera; unlike stream tokens, a fresh token is
 * requested every time a popup opens rather than cached, since media files
 * are opened far less often than the live view.
 */
@Injectable({ providedIn: 'root' })
export class MediaTokenApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(VideoServiceHubConfig);

  async acquire(request: MediaTokenRequest): Promise<string> {
    const response = await firstValueFrom(
      this.http.post<BackendMediaTokenResponse>(`${this.config.baseUrl}/auth/media-token`, request),
    );
    return response.mediaToken;
  }

  buildTokenedUrl(downloadUrl: string, mediaToken: string): string {
    return `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}mediaToken=${encodeURIComponent(mediaToken)}`;
  }
}
