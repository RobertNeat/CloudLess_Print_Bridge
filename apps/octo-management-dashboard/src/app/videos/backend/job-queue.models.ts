/** Mirrors the hub's TrackedCameraCommand (jobs.types.ts in video-service-hub). */
export type JobCommand =
  'capture' | 'periodic-capture' | 'timed-recording' | 'start-recording' | 'record-audio';

/** Mirrors the hub's JobKind (jobs.types.ts in video-service-hub). */
export type JobKind = 'captures' | 'timelapses' | 'recordings' | 'audio';

/** Mirrors the hub's JobStatus (jobs.types.ts in video-service-hub). */
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/**
 * Mirrors the hub's JobDto exactly (jobs.types.ts in video-service-hub).
 * Optional fields are simply absent from the JSON response when unset, not
 * `null`.
 */
export interface JobDto {
  readonly requestId: string;
  readonly cameraId: string;
  readonly cameraName?: string;
  readonly kind: JobKind;
  readonly command: JobCommand;
  readonly status: JobStatus;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly expectedFileName?: string;
  readonly error?: string;
}
