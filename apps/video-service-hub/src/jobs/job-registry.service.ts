import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CameraRegistryService } from '../camera-registry/camera-registry.service';
import {
  buildFinalFileName,
  resolveCameraNaming,
} from '../storage/resource-naming';
import type {
  JobDto,
  JobKind,
  JobStatus,
  TrackedCameraCommand,
} from './jobs.types';

/** How long a terminal (done/failed/cancelled) job stays visible in list() before being pruned, so the frontend can show a brief "finished" state. */
const TERMINAL_GRACE_MS = 5_000;

type JobRecord = {
  requestId: string;
  cameraId: string;
  cameraName?: string;
  kind: JobKind;
  command: TrackedCameraCommand;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  expectedFileName?: string;
  error?: string;
  /** Dispatches the command to the camera. Invoked immediately if the camera is idle, or later on promotion. Must never throw synchronously -- all failure paths go through markFailed. */
  start: () => void;
  /** Watchdog duration, captured at enqueue time and reused on promotion (queued jobs don't get a fresh one computed since the original request's duration/parameters are what determined it). */
  expectedDurationMs: number;
  /** Watchdog: fires if the job never reaches a terminal state (e.g. camera acked but never uploaded / crashed). Cleared on any terminal transition. */
  timeout?: NodeJS.Timeout;
};

/**
 * In-memory (no persistence, no database) registry of tracked camera-command
 * jobs, used to:
 *  1. Give the frontend something to poll (GET /api/v1/jobs) for "what's
 *     running/queued right now" across the fleet, beyond the initial
 *     synchronous command response.
 *  2. Serialize commands per camera: only one job per cameraId may be
 *     `running` at a time. A second command for a busy camera is enqueued
 *     as `queued` and dispatched later, FIFO, once the running job for that
 *     camera reaches a terminal state.
 *
 * Deliberately NOT tracked: start-live / start-dynamic-live / stop-live /
 * stop-recording. Live sessions are interactive and long-running by design
 * (not a fire-and-forget capture/recording job), and queuing a `stop-*`
 * command behind another job for the same camera would make it impossible
 * to ever stop a running command -- stop commands must always reach the
 * camera immediately. CameraCommandService dispatches those directly,
 * bypassing this registry entirely.
 */
@Injectable()
export class JobRegistryService {
  private readonly jobs = new Map<string, JobRecord>();
  /** Keyed by cameraId. FIFO queue of requestIds waiting for that camera to free up. Does not include the currently-running job. */
  private readonly queues = new Map<string, string[]>();
  /** Keyed by cameraId. requestId of the job currently running on that camera, if any. */
  private readonly runningByCamera = new Map<string, string>();

  constructor(private readonly cameraRegistry: CameraRegistryService) {}

  /**
   * Registers a new job for `cameraId`/`requestId`. If the camera is idle,
   * `start` is invoked synchronously (before this method returns) and the
   * job is recorded as `running`. Otherwise the job is recorded as `queued`
   * and `start` is invoked later, by promote(), once the camera frees up.
   *
   * Throws ConflictException if requestId is already tracked (active or
   * still within its terminal grace period).
   */
  enqueue(options: {
    requestId: string;
    cameraId: string;
    kind: JobKind;
    command: TrackedCameraCommand;
    start: () => void;
    expectedDurationMs: number;
  }): JobDto {
    const { requestId, cameraId, kind, command, start, expectedDurationMs } =
      options;
    if (this.jobs.has(requestId)) {
      throw new ConflictException(`job ${requestId} is already tracked`);
    }

    const naming = resolveCameraNaming(
      cameraId,
      this.cameraRegistry.tryGet(cameraId),
    );
    const record: JobRecord = {
      requestId,
      cameraId,
      cameraName: naming.name,
      kind,
      command,
      status: 'queued',
      createdAt: new Date().toISOString(),
      expectedFileName: buildFinalFileName(kind, naming),
      start,
      expectedDurationMs,
    };
    this.jobs.set(requestId, record);

    if (this.runningByCamera.has(cameraId)) {
      const queue = this.queues.get(cameraId) ?? [];
      queue.push(requestId);
      this.queues.set(cameraId, queue);
    } else {
      this.beginRunning(record, expectedDurationMs);
    }

    return this.toDto(record);
  }

  /** Arms the watchdog and invokes start(). Called both for an immediately-dispatched job and for a promoted one. */
  private beginRunning(record: JobRecord, expectedDurationMs: number): void {
    record.status = 'running';
    record.startedAt = new Date().toISOString();
    this.runningByCamera.set(record.cameraId, record.requestId);
    record.timeout = setTimeout(() => {
      this.markFailed(record.requestId, 'job timed out waiting for completion');
    }, expectedDurationMs);
    record.timeout.unref?.();
    try {
      record.start();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.markFailed(record.requestId, reason);
    }
  }

  markDone(requestId: string): void {
    this.finish(requestId, 'done');
  }

  markFailed(requestId: string, error?: string): void {
    this.finish(requestId, 'failed', error);
  }

  /** Cancels a job. Only allowed while status is `queued` -- a running job cannot be cancelled here since the camera has already been told to start (and there's no "abort" for capture/recording commands in this registry). */
  cancel(requestId: string): JobDto {
    const record = this.jobs.get(requestId);
    if (!record) {
      throw new NotFoundException(`job ${requestId} was not found`);
    }
    if (record.status !== 'queued') {
      throw new ConflictException(
        `job ${requestId} cannot be cancelled while status is ${record.status}`,
      );
    }
    record.status = 'cancelled';
    record.finishedAt = new Date().toISOString();
    this.removeFromQueue(record.cameraId, requestId);
    this.scheduleGracePeriodPrune(requestId);
    return this.toDto(record);
  }

  list(filter?: { cameraId?: string }): JobDto[] {
    return [...this.jobs.values()]
      .filter((job) => !filter?.cameraId || job.cameraId === filter.cameraId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((job) => this.toDto(job));
  }

  getPerCameraQueue(cameraId: string): JobDto[] {
    const requestIds = this.queues.get(cameraId) ?? [];
    return requestIds
      .map((id) => this.jobs.get(id))
      .filter((job): job is JobRecord => job !== undefined)
      .map((job) => this.toDto(job));
  }

  private finish(
    requestId: string,
    status: 'done' | 'failed',
    error?: string,
  ): void {
    const record = this.jobs.get(requestId);
    // Unknown or already-terminal requestId: silent no-op. This keeps
    // callers (CameraCommandService's fetch resolution, ingest's finalize
    // completion, the watchdog) simple -- none of them need to check "is
    // this job still active" before reporting an outcome, and a late signal
    // after a timeout must not flip state again or promote twice.
    if (
      !record ||
      record.status === 'done' ||
      record.status === 'failed' ||
      record.status === 'cancelled'
    ) {
      return;
    }
    if (record.timeout) {
      clearTimeout(record.timeout);
      record.timeout = undefined;
    }
    record.status = status;
    record.finishedAt = new Date().toISOString();
    if (error) {
      record.error = error;
    }
    if (this.runningByCamera.get(record.cameraId) === requestId) {
      this.runningByCamera.delete(record.cameraId);
    }
    this.scheduleGracePeriodPrune(requestId);
    this.promoteNext(record.cameraId);
  }

  private promoteNext(cameraId: string): void {
    if (this.runningByCamera.has(cameraId)) return;
    const queue = this.queues.get(cameraId);
    if (!queue || queue.length === 0) return;
    const nextId = queue.shift();
    if (queue.length === 0) {
      this.queues.delete(cameraId);
    }
    if (!nextId) return;
    const next = this.jobs.get(nextId);
    if (!next || next.status !== 'queued') {
      // Shouldn't happen (cancel() removes from queue), but guard anyway.
      this.promoteNext(cameraId);
      return;
    }
    this.beginRunning(next, next.expectedDurationMs);
  }

  private removeFromQueue(cameraId: string, requestId: string): void {
    const queue = this.queues.get(cameraId);
    if (!queue) return;
    const index = queue.indexOf(requestId);
    if (index >= 0) {
      queue.splice(index, 1);
    }
    if (queue.length === 0) {
      this.queues.delete(cameraId);
    }
  }

  private scheduleGracePeriodPrune(requestId: string): void {
    const timer = setTimeout(() => {
      this.jobs.delete(requestId);
    }, TERMINAL_GRACE_MS);
    timer.unref?.();
  }

  private toDto(record: JobRecord): JobDto {
    return {
      requestId: record.requestId,
      cameraId: record.cameraId,
      cameraName: record.cameraName,
      kind: record.kind,
      command: record.command,
      status: record.status,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      expectedFileName: record.expectedFileName,
      error: record.error,
    };
  }
}
