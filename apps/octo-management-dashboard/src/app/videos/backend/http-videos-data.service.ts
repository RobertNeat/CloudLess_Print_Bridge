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
  BackendStreamTokenResponse,
} from './video-api.types';
import { VideoServiceHubConfig } from './video-service-hub.config';

const AVAILABLE_RESOLUTIONS = ['QVGA', 'VGA', 'SVGA', 'XGA', 'UXGA'] as const;
const DEFAULT_RESOLUTION = 'VGA';
const MAX_LIVE_DURATION_MS = 600_000;
const DEFAULT_LOCATION_CODE = 'workshop';
const MEDIA_PAGE_LIMIT = 50;
const MEDIA_PAGE_DRAIN_CAP = 20;

/**
 * Real VideosRepositoryPort implementation backed by video-service-hub.
 * The backend has no equivalent of camera-panel's power/mode/fps/temperature
 * metrics (those belong to a physical device, not the video service), so
 * only `status` and `cameraIp` are derived from `/api/v1/cameras`; the rest
 * stay absent (CameraMetric.value/valueCode are both optional) rather than
 * being faked.
 */
@Injectable({ providedIn: 'root' })
export class HttpVideosDataService implements VideosRepositoryPort {
  private readonly http = inject(HttpClient);
  private readonly config = inject(VideoServiceHubConfig);

  /**
   * Stream tokens are cached per cameraId for the lifetime of this service
   * (a page load), because issuing a new token for the same (user, camera)
   * pair invalidates the previous one on the backend — re-fetching on every
   * `load()` (e.g. from retryLoad()) would kick any viewer already watching
   * that camera's live stream off their own token.
   */
  private readonly streamTokens = new Map<string, string>();

  async load(): Promise<VideosDashboardData> {
    const [cameras, media] = await Promise.all([this.fetchCameras(), this.fetchAllMedia()]);
    const sources = await this.mapSources(cameras);
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

  private async fetchAllMedia(): Promise<readonly BackendMediaItemDto[]> {
    const items: BackendMediaItemDto[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MEDIA_PAGE_DRAIN_CAP; page++) {
      const params: Record<string, string> = { limit: String(MEDIA_PAGE_LIMIT) };
      if (cursor) params['cursor'] = cursor;
      const response = await firstValueFrom(
        this.http.get<BackendMediaListResponse>(`${this.config.baseUrl}/api/v1/recordings`, {
          params,
        }),
      );
      items.push(...response.items);
      if (!response.nextCursor) break;
      cursor = response.nextCursor;
    }
    return items;
  }

  private async mapSources(cameras: readonly BackendCameraDto[]): Promise<CameraSource[]> {
    return Promise.all(
      cameras.map(async (camera) => {
        const status: 'online' | 'offline' = camera.online ? 'online' : 'offline';
        const previewUrl =
          status === 'online' ? await this.buildPreviewUrl(camera.cameraId) : undefined;
        return {
          id: camera.cameraId,
          name: camera.displayName || camera.cameraId,
          locationCode: this.mapLocationCode(camera.locationCode),
          status,
          previewUrl,
          commandBaseUrl: camera.baseUrl,
        };
      }),
    );
  }

  private async buildPreviewUrl(cameraId: string): Promise<string> {
    const token = await this.acquireStreamToken(cameraId);
    return `${this.config.baseUrl}/api/v1/cameras/${encodeURIComponent(cameraId)}/live?streamToken=${encodeURIComponent(token)}`;
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
      downloadUrl: `${this.config.baseUrl}${item.downloadUrl}`,
      transcodeUrl: item.transcodeUrl ? `${this.config.baseUrl}${item.transcodeUrl}` : undefined,
      mp4Url: item.mp4Url ? `${this.config.baseUrl}${item.mp4Url}` : undefined,
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
