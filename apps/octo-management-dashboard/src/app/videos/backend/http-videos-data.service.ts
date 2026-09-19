import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { VideosRepositoryPort } from '../videos-dashboard.ports';
import type {
  CameraMetric,
  CameraSource,
  MediaItem,
  VideosDashboardData,
} from '../videos-dashboard.models';
import type {
  BackendCameraDto,
  BackendCameraListResponse,
  BackendMediaItemDto,
  BackendMediaListResponse,
} from './video-api.types';
import { VideoServiceHubConfig } from './video-service-hub.config';

const AVAILABLE_RESOLUTIONS = ['QVGA', 'VGA', 'SVGA', 'XGA', 'UXGA'] as const;
const DEFAULT_RESOLUTION = 'VGA';
const DEFAULT_LOCATION_CODE = 'workshop';
const MEDIA_PAGE_LIMIT = 50;
const MEDIA_PAGE_DRAIN_CAP = 20;

/** The hub's 4 list endpoints (captures/timelapses/video/audio — video merges recordings+live server-side), each independently cursor-paginated. */
const LIST_ENDPOINTS = ['captures', 'timelapses', 'video', 'audio'] as const;

/**
 * Real VideosRepositoryPort implementation backed by video-service-hub.
 * The backend has no equivalent of camera-panel's power/mode/fps/temperature
 * metrics (those belong to a physical device, not the video service), so
 * only `status` and `cameraIp` are derived from `/api/v1/cameras`; the rest
 * stay absent (CameraMetric.value/valueCode are both optional) rather than
 * being faked.
 *
 * The live MJPEG preview URL is NOT built here: the hub's
 * `GET /api/v1/live/{cameraId}/{requestId}/stream` route needs a requestId
 * that only exists once start-live has actually been dispatched, so
 * CameraSource carries no previewUrl — see LiveStreamApiService, called by
 * VideosDashboardPage once it has minted that requestId.
 */
@Injectable({ providedIn: 'root' })
export class HttpVideosDataService implements VideosRepositoryPort {
  private readonly http = inject(HttpClient);
  private readonly config = inject(VideoServiceHubConfig);

  async load(): Promise<VideosDashboardData> {
    const [cameras, media] = await Promise.all([this.fetchCameras(), this.fetchAllMedia()]);
    const sources = this.mapSources(cameras);
    const firstOnline = sources.find((source) => source.status === 'online');
    const selectedSource = firstOnline ?? sources[0];

    return {
      metrics: selectedSource ? this.mapMetrics(cameras, selectedSource.id) : [],
      sources,
      player: {
        active: false,
        selectedSourceId: selectedSource?.id ?? '',
        resolution: DEFAULT_RESOLUTION,
        availableResolutions: AVAILABLE_RESOLUTIONS,
      },
      media: media.map((item) => this.mapMediaItem(item)),
    };
  }

  /** Lighter refresh for polling: re-fetches only camera/source status, not the paginated media list. */
  async refreshSources(): Promise<CameraSource[]> {
    return this.mapSources(await this.fetchCameras());
  }

  /** Lighter refresh after a media rename/delete: re-fetches only the media list, leaving the live player/source selection untouched. */
  async refreshMedia(): Promise<MediaItem[]> {
    const media = await this.fetchAllMedia();
    return media.map((item) => this.mapMediaItem(item));
  }

  private async fetchCameras(): Promise<readonly BackendCameraDto[]> {
    const response = await firstValueFrom(
      this.http.get<BackendCameraListResponse>(`${this.config.baseUrl}/api/v1/cameras`),
    );
    return response.items;
  }

  /**
   * Drains each of the 4 list endpoints (captures/timelapses/video/audio) in
   * parallel and merges the results client-side. The dashboard's media
   * library always displays every kind together in one grid (grouped into
   * sections by kind — see MediaLibrary), so there is no view that only
   * needs one kind's items; draining separately per kind and merging here is
   * simplest for that single consumer. Each drain paginates independently
   * since the hub's cursors are scoped per endpoint.
   */
  private async fetchAllMedia(): Promise<readonly BackendMediaItemDto[]> {
    const results = await Promise.all(
      LIST_ENDPOINTS.map((endpoint) => this.drainEndpoint(endpoint)),
    );
    return results.flat();
  }

  private async drainEndpoint(endpoint: (typeof LIST_ENDPOINTS)[number]): Promise<BackendMediaItemDto[]> {
    const items: BackendMediaItemDto[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MEDIA_PAGE_DRAIN_CAP; page++) {
      const params: Record<string, string> = { limit: String(MEDIA_PAGE_LIMIT) };
      if (cursor) params['cursor'] = cursor;
      const response = await firstValueFrom(
        this.http.get<BackendMediaListResponse>(`${this.config.baseUrl}/api/v1/${endpoint}`, {
          params,
        }),
      );
      items.push(...response.items);
      if (!response.nextCursor) break;
      cursor = response.nextCursor;
    }
    return items;
  }

  private mapSources(cameras: readonly BackendCameraDto[]): CameraSource[] {
    return cameras.map((camera) => {
      const status: 'online' | 'offline' = camera.online ? 'online' : 'offline';
      return {
        id: camera.cameraId,
        name: camera.displayName || camera.cameraId,
        locationCode: this.mapLocationCode(camera.locationCode),
        status,
        commandBaseUrl: camera.baseUrl,
      };
    });
  }

  private mapLocationCode(value: string | undefined): string {
    return value?.trim() || DEFAULT_LOCATION_CODE;
  }

  private mapMetrics(cameras: readonly BackendCameraDto[], cameraId: string): CameraMetric[] {
    const camera = cameras.find((entry) => entry.cameraId === cameraId);
    if (!camera) return [];
    const metrics: CameraMetric[] = [
      camera.online ? { code: 'status', valueCode: 'ready' } : { code: 'status', value: 'offline' },
    ];
    if (camera.baseUrl) {
      metrics.push({ code: 'serviceIp', value: camera.baseUrl });
    }
    return metrics;
  }

  private mapMediaItem(item: BackendMediaItemDto): MediaItem {
    return {
      id: item.id,
      kind: item.kind,
      name: item.fileName,
      displayName: item.displayName,
      sourceId: item.cameraId,
      requestId: item.requestId,
      capturedAt: item.capturedAt,
      duration:
        item.durationSeconds === undefined ? undefined : formatDuration(item.durationSeconds),
      frameCount: item.frameCount,
      thumbnailUrl: `${this.config.baseUrl}${item.thumbnailUrl}`,
      thumbnailUrlDark: item.thumbnailUrlDark
        ? `${this.config.baseUrl}${item.thumbnailUrlDark}`
        : undefined,
      thumbnailUrlLight: item.thumbnailUrlLight
        ? `${this.config.baseUrl}${item.thumbnailUrlLight}`
        : undefined,
      downloadUrl: `${this.config.baseUrl}${item.downloadUrl}`,
    };
  }
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}
