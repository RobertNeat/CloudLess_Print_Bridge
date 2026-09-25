import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { JobRegistryService } from '../jobs/job-registry.service';
import type { JobKind, TrackedCameraCommand } from '../jobs/jobs.types';
import { MediaStorageService } from '../storage/media-storage.service';
import {
  cameraCommandPaths,
  type CameraCommand,
  type CameraCommandResult,
} from './camera-command.types';
import {
  parseCameraBaseUrl,
  parseCameraCommand,
  validateCommandPayload,
} from './camera-command.validator';
import { assertIdentifier } from '../common/validation';

/** Maps a tracked camera command to the job-registry kind it produces. Stop/live commands are not in this map -- they bypass the registry entirely (see JobRegistryService's doc comment). */
const trackedCommandKinds: Partial<Record<CameraCommand, JobKind>> = {
  capture: 'captures',
  'periodic-capture': 'timelapses',
  'timed-recording': 'recordings',
  'start-recording': 'recordings',
  'record-audio': 'audio',
};

/** Margin added on top of the command's own expected duration, to absorb upload + transcode time before the watchdog gives up on a job. */
const WATCHDOG_MARGIN_MS = 2 * 60_000;

@Injectable()
export class CameraCommandService {
  private readonly logger = new Logger(CameraCommandService.name);

  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly storage: MediaStorageService,
    private readonly jobs: JobRegistryService,
  ) {}

  async execute(
    cameraId: string,
    commandName: string,
    input: Record<string, unknown>,
  ): Promise<CameraCommandResult> {
    assertIdentifier(cameraId, 'cameraId');
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException(
        'camera command body must be a JSON object',
      );
    }
    const command = parseCameraCommand(commandName);
    const cameraBaseUrl = parseCameraBaseUrl(input.cameraBaseUrl);
    const payload = validateCommandPayload(command, input, {
      timelapseMaxDurationMs: this.config.timelapse.maxDurationMs,
      recordingMaxDurationMs: this.config.recording.maxDurationMs,
      liveMaxDurationMs: this.config.live.maxDurationMs,
      intervalMaxDurationMs: this.config.timelapse.intervalMaxDurationMs,
    });
    // `persist` is a hub-only directive for the ingest leg (see
    // MediaStorageService.setLivePersistIntent) — the camera firmware has no
    // concept of it, so it must never be forwarded in the outbound POST body.
    const persist = payload.persist;
    delete payload.persist;
    if (command === 'start-live' || command === 'start-dynamic-live') {
      const requestId = payload.requestId as string;
      this.storage.setLivePersistIntent(cameraId, requestId, persist !== false);
    } else if (
      command === 'stop-live' &&
      typeof payload.requestId === 'string'
    ) {
      this.storage.clearLivePersistIntent(cameraId, payload.requestId);
    }
    const url = `${cameraBaseUrl}${cameraCommandPaths[command]}`;
    const jobKind = trackedCommandKinds[command];

    if (!jobKind) {
      // Untracked (stop-*, start-live/start-dynamic-live): always dispatched
      // immediately, never queued -- see JobRegistryService's doc comment
      // for why these must bypass the per-camera job queue.
      return this.dispatch(cameraId, command, url, payload);
    }

    const requestId = payload.requestId as string;
    const kind = jobKind;
    // Captured by start() below when (and only when) the registry invokes
    // it synchronously inside enqueue() -- i.e. the camera was idle. When
    // the job is queued instead, start() isn't called yet, `immediate`
    // stays undefined, and we return a synthetic "queued" response instead
    // of ever touching the camera. This guarantees exactly one fetch per
    // command: dispatch() is only ever invoked from inside start().
    let immediate: Promise<CameraCommandResult> | undefined;
    const job = this.jobs.enqueue({
      requestId,
      cameraId,
      kind,
      command: command as TrackedCameraCommand,
      expectedDurationMs: this.expectedDurationMs(command, payload),
      start: () => {
        const dispatched = this.dispatch(cameraId, command, url, payload);
        immediate = dispatched;
        dispatched.then(
          (result) => {
            // A 2xx here only means "camera acknowledged the command" --
            // not completion. Every tracked kind, including captures,
            // finishes once the camera uploads the file and ingest calls
            // transcoding.finalize() (see CameraIngestController.onPartStored,
            // which calls jobs.markDone/markFailed). The watchdog armed in
            // JobRegistryService.beginRunning covers the case where the
            // camera acks but the upload never arrives.
            if (result.status < 200 || result.status >= 300) {
              this.jobs.markFailed(
                requestId,
                `camera responded with status ${result.status}`,
              );
            }
          },
          (error: Error) => {
            // No unhandled rejection: this branch always runs, whether
            // `immediate` is awaited by the caller below (idle camera) or
            // left to run in the background (promoted job).
            this.jobs.markFailed(requestId, error.message);
          },
        );
      },
    });

    if (job.status === 'queued') {
      return {
        status: 202,
        contentType: 'application/json',
        body: {
          status: 'queued',
          requestId,
          position: this.queuePosition(cameraId, requestId),
        },
      };
    }
    // job.status === 'running': start() ran synchronously above, so
    // `immediate` is set. Awaiting it surfaces the real camera response (or
    // lets dispatch()'s BadGatewayException propagate), preserving today's
    // HTTP semantics for the caller.
    return immediate as Promise<CameraCommandResult>;
  }

  /**
   * Performs the actual outbound fetch to the camera firmware. Shared by
   * both untracked (immediate) commands and tracked commands' start()
   * callback.
   */
  private async dispatch(
    cameraId: string,
    command: CameraCommand,
    url: string,
    payload: Record<string, unknown>,
  ): Promise<CameraCommandResult> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.cameraCommandTimeoutMs),
      });
      const contentType = response.headers.get('content-type') ?? undefined;
      const text = await response.text();
      let body: unknown = text || null;
      if (contentType?.toLowerCase().includes('application/json') && text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          this.logger.warn(
            `Camera ${cameraId} returned malformed JSON for ${command}`,
          );
        }
      }
      return { status: response.status, contentType, body };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Command ${command} for camera ${cameraId} failed: ${reason}`,
      );
      throw new BadGatewayException(`camera command failed: ${reason}`);
    }
  }

  private queuePosition(cameraId: string, requestId: string): number {
    const queue = this.jobs.getPerCameraQueue(cameraId);
    const index = queue.findIndex((item) => item.requestId === requestId);
    return index >= 0 ? index + 1 : queue.length;
  }

  private expectedDurationMs(
    command: CameraCommand,
    payload: Record<string, unknown>,
  ): number {
    switch (command) {
      case 'periodic-capture':
      case 'timed-recording': {
        const durationMs =
          typeof payload.durationMs === 'number' ? payload.durationMs : 0;
        return durationMs + WATCHDOG_MARGIN_MS;
      }
      case 'record-audio': {
        const durationSeconds =
          typeof payload.durationSeconds === 'number'
            ? payload.durationSeconds
            : 0;
        return durationSeconds * 1000 + WATCHDOG_MARGIN_MS;
      }
      case 'start-recording': {
        const maxDurationMs =
          typeof payload.maxDurationMs === 'number'
            ? payload.maxDurationMs
            : this.config.recording.maxDurationMs;
        return maxDurationMs + WATCHDOG_MARGIN_MS;
      }
      case 'capture':
      default:
        return this.config.cameraCommandTimeoutMs + WATCHDOG_MARGIN_MS;
    }
  }
}
