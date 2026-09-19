export type MediaKind = 'image' | 'timelapse' | 'recording' | 'live' | 'audio';

export type MediaItemDto = {
  id: string;
  kind: MediaKind;
  cameraId: string;
  requestId: string;
  /** Backend-resolved final filename, e.g. `image-front_(192.168.1.205)_003.jpg` -- already carries the day-grouped `_00x` counter. */
  fileName: string;
  displayName?: string;
  capturedAt: string;
  durationSeconds?: number;
  frameCount?: number;
  size: number;
  thumbnailUrl: string;
  /** Present only for kind: 'audio'. Waveform thumbnails are pre-rendered in
   * two color variants (see ThumbnailService) since the backend generates
   * them once at ingest and has no way to know a viewer's live theme
   * preference; the frontend picks between them based on the active theme.
   * thumbnailUrl mirrors thumbnailUrlDark for any caller that doesn't care. */
  thumbnailUrlDark?: string;
  thumbnailUrlLight?: string;
  downloadUrl: string;
};

export type MediaListQuery = {
  cameraId?: string;
  cursor?: string;
  limit?: number;
};

export type MediaListResult = {
  items: MediaItemDto[];
  nextCursor?: string;
};
