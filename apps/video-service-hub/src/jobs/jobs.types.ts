import type { MediaResourceKind } from '../storage/storage.types';

/** Camera commands that are tracked by the job registry and serialized per camera. Stop/live commands are intentionally excluded -- see JobRegistryService doc comment. */
export type TrackedCameraCommand =
  | 'capture'
  | 'periodic-capture'
  | 'timed-recording'
  | 'start-recording'
  | 'record-audio';

export type JobKind = Extract<
  MediaResourceKind,
  'captures' | 'timelapses' | 'recordings' | 'audio'
>;

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/** Public shape returned by GET /api/v1/jobs and DELETE /api/v1/jobs/:requestId. Mirrors MediaListResult's item/list convention in media-library.types.ts. */
export type JobDto = {
  requestId: string;
  cameraId: string;
  cameraName?: string;
  kind: JobKind;
  command: TrackedCameraCommand;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** Best-effort final filename, e.g. `recording-Workshop.mp4`. Approximate:
   * the media library appends a day-grouped `_00x` counter
   * (see media-library.types.ts MediaItemDto.fileName) that this field does
   * not include, since that counter is only assigned at list-time. */
  expectedFileName?: string;
  error?: string;
};

export type JobListResult = {
  items: JobDto[];
};
