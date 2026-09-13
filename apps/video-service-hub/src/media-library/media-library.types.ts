export type MediaKind = 'recording' | 'image' | 'audio';

export type MediaItemDto = {
  id: string;
  kind: MediaKind;
  cameraId: string;
  requestId: string;
  fileName: string;
  displayName?: string;
  capturedAt: string;
  durationSeconds?: number;
  frameCount?: number;
  size: number;
  thumbnailUrl: string;
  downloadUrl: string;
};

export type MediaListQuery = {
  cameraId?: string;
  kind?: MediaKind;
  cursor?: string;
  limit?: number;
};

export type MediaListResult = {
  items: MediaItemDto[];
  nextCursor?: string;
};
