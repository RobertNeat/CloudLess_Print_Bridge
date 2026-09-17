export type MediaKind = 'recording' | 'image' | 'timelapse' | 'audio';

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
  /** Present only for kind: 'recording'. MP4 playback for this item is
   * available by POSTing transcodeUrl (idempotent; encodes once, then
   * hands off the cached file) and then GETing mp4Url with Range support. */
  transcodeUrl?: string;
  mp4Url?: string;
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
