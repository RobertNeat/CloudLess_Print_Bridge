export type BackendMediaKind = 'recording' | 'image' | 'audio';

export interface BackendCameraDto {
  readonly cameraId: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly lastHeartbeatAt: string | null;
  readonly lastChannel: string;
  readonly messageCount: number;
  readonly online: boolean;
  readonly baseUrl?: string;
  readonly displayName?: string;
  readonly locationCode?: string;
}

export interface BackendCameraListResponse {
  readonly items: readonly BackendCameraDto[];
  readonly count: number;
}

export interface BackendMediaItemDto {
  readonly id: string;
  readonly kind: BackendMediaKind;
  readonly cameraId: string;
  readonly requestId: string;
  readonly fileName: string;
  readonly capturedAt: string;
  readonly durationSeconds?: number;
  readonly frameCount?: number;
  readonly size: number;
  readonly thumbnailUrl: string;
  readonly downloadUrl: string;
}

export interface BackendMediaListResponse {
  readonly items: readonly BackendMediaItemDto[];
  readonly nextCursor?: string;
}

export interface BackendStreamTokenResponse {
  readonly streamToken: string;
  readonly expiresIn: number;
}
