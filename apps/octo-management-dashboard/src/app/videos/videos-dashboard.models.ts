/**
 * Mirrors the hub's MediaFileKind exactly (media-token.service.ts /
 * media-library.types.ts in video-service-hub): 'capture' | 'timelapse' |
 * 'recording' | 'live' | 'audio' on the wire map here as 'image' (frontend's
 * existing name for a capture) | 'timelapse' | 'recording' | 'live' | 'audio'.
 * 'live' items are completed live-view recordings, grouped into the same
 * "recordings" media-library section as 'recording' in the UI (the hub also
 * merges them server-side into one GET /api/v1/video list) but kept as a
 * distinct MediaKind since it has its own URL segment, token kind, and
 * rename/delete routes.
 */
export type MediaKind = 'audio' | 'recording' | 'live' | 'timelapse' | 'image';

export type CameraMetricCode =
  'status' | 'power' | 'mode' | 'resolution' | 'fps' | 'temperature' | 'cameraIp' | 'serviceIp';

export type CameraMetricValueCode = 'stream' | 'enabled' | 'ready';
export type CameraLocationCode = 'printerChamber' | 'buildPlate' | 'workshop';

export interface CameraMetric {
  readonly code: CameraMetricCode;
  readonly value?: string | number;
  readonly valueCode?: CameraMetricValueCode;
}

export interface CameraSource {
  readonly id: string;
  readonly name: string;
  /** One of the known location codes, or free text from a real camera registry entry. */
  readonly locationCode: CameraLocationCode | (string & {});
  readonly status: 'online' | 'offline';
  readonly previewUrl?: string;
  /** Camera's own HTTP origin, used to send start-live/stop-live commands. Absent for mock/no-command sources. */
  readonly commandBaseUrl?: string;
}

export interface VideoPlayerData {
  readonly active: boolean;
  readonly selectedSourceId: string;
  readonly resolution: string;
  readonly availableResolutions: readonly string[];
}

export interface MediaItem {
  readonly id: string;
  readonly kind: MediaKind;
  readonly name: string;
  readonly displayName?: string;
  readonly sourceId: string;
  /** Absent for mock-data items, which have no backing file to fetch/delete/rename. */
  readonly requestId?: string;
  readonly capturedAt: string;
  readonly duration?: string;
  readonly frameCount?: number;
  readonly thumbnailUrl?: string;
  /** Present only for kind: 'audio'. Two pre-rendered waveform gradients
   * (white-to-darkgrey / black-to-darkgrey); pick the one matching
   * ThemeService.isDark() at render time, falling back to thumbnailUrl. */
  readonly thumbnailUrlDark?: string;
  readonly thumbnailUrlLight?: string;
  /**
   * Absent for mock-data items, which have no backing file to fetch/delete/rename.
   * Always points at the finished, already-transcoded asset directly — the hub
   * transcodes eagerly/synchronously on ingest completion, so there is no
   * separate transcode-trigger URL or intermediate "not ready yet" state to
   * poll for. Captures are the one kind that were never transcoded to begin
   * with (still JPEGs); this URL just serves the JPEG for those.
   */
  readonly downloadUrl?: string;
}

export interface VideosDashboardData {
  readonly metrics: readonly CameraMetric[];
  readonly sources: readonly CameraSource[];
  readonly player: VideoPlayerData;
  readonly media: readonly MediaItem[];
}
