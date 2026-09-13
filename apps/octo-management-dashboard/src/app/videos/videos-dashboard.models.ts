export type MediaKind = 'audio' | 'recording' | 'timelapse' | 'image';

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
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly duration?: string;
  readonly thumbnailUrl?: string;
}

export interface VideosDashboardData {
  readonly metrics: readonly CameraMetric[];
  readonly sources: readonly CameraSource[];
  readonly player: VideoPlayerData;
  readonly media: readonly MediaItem[];
}
