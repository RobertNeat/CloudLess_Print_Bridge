export type MediaKind = 'audio' | 'recording' | 'timelapse' | 'image';

export interface CameraMetric {
  readonly label: string;
  readonly value: string;
}

export interface CameraSource {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly status: 'online' | 'offline';
}

export interface VideoPlayerData {
  readonly active: boolean;
  readonly selectedSourceId: string;
  readonly resolution: string;
  readonly availableResolutions: readonly string[];
  readonly previewUrl: string;
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
