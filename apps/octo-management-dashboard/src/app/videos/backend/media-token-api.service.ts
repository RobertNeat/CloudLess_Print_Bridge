import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MediaKind } from '../videos-dashboard.models';
import type { BackendMediaTokenResponse } from './video-api.types';
import { VideoServiceHubConfig } from './video-service-hub.config';

/** Mirrors the hub's MediaFileKind exactly (media-token.service.ts in video-service-hub). */
export type MediaTokenKind = 'capture' | 'timelapse' | 'recording' | 'live' | 'audio';

export type MediaTokenRequest = {
  readonly kind: MediaTokenKind;
  readonly cameraId: string;
  readonly requestId: string;
  readonly fileName?: string;
};

/**
 * The hub's kind scheme is now unambiguous (no more 'live-recording' vs
 * 'recording' guessing — a completed live-view recording is its own 'live'
 * kind, fixed end to end from ingest through the media-library and token
 * guards), so this is a straight 1:1 mapping from frontend MediaKind to the
 * hub's MediaFileKind.
 */
export function mediaKindToTokenKind(kind: MediaKind): MediaTokenKind {
  switch (kind) {
    case 'audio':
      return 'audio';
    case 'image':
      return 'capture';
    case 'timelapse':
      return 'timelapse';
    case 'live':
      return 'live';
    case 'recording':
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
