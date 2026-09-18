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
  /** Present only for kind: 'audio'. Waveform thumbnails are pre-rendered in
   * two color variants (see ThumbnailService) since the backend generates
   * them once at ingest and has no way to know a viewer's live theme
   * preference; the frontend picks between them based on the active theme.
   * thumbnailUrl mirrors thumbnailUrlDark for any caller that doesn't care. */
  thumbnailUrlDark?: string;
  thumbnailUrlLight?: string;
  downloadUrl: string;
  /** Present only for kind: 'recording' and kind: 'timelapse'. MP4 playback
   * for this item is available by POSTing transcodeUrl (idempotent; encodes
   * once, then hands off the cached file -- a timelapse re-encodes instead
   * if a newer capture frame has arrived since) and then GETing mp4Url with
   * Range support. */
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
