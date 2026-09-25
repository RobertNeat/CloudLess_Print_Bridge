import { ConflictException, NotFoundException } from '@nestjs/common';
import type { CameraRegistryService } from '../camera-registry/camera-registry.service';
import { JobRegistryService } from './job-registry.service';

function fakeRegistry(): CameraRegistryService {
  return { tryGet: () => undefined } as unknown as CameraRegistryService;
}

describe('JobRegistryService', () => {
  let registry: JobRegistryService;

  beforeEach(() => {
    jest.useFakeTimers();
    registry = new JobRegistryService(fakeRegistry());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the first job for an idle camera immediately', () => {
    const start = jest.fn();
    const job = registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'captures',
      command: 'capture',
      start,
      expectedDurationMs: 10_000,
    });

    expect(job.status).toBe('running');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('queues a second job for the same camera and does not start it', () => {
    registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });
    const secondStart = jest.fn();
    const job = registry.enqueue({
      requestId: 'r2',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: secondStart,
      expectedDurationMs: 10_000,
    });

    expect(job.status).toBe('queued');
    expect(secondStart).not.toHaveBeenCalled();
    expect(
      registry.getPerCameraQueue('cam-1').map((item) => item.requestId),
    ).toEqual(['r2']);
  });

  it('promotes the next queued job (FIFO) once the running job finishes', () => {
    registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });
    const secondStart = jest.fn();
    registry.enqueue({
      requestId: 'r2',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: secondStart,
      expectedDurationMs: 10_000,
    });
    const thirdStart = jest.fn();
    registry.enqueue({
      requestId: 'r3',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: thirdStart,
      expectedDurationMs: 10_000,
    });

    registry.markDone('r1');

    expect(secondStart).toHaveBeenCalledTimes(1);
    expect(thirdStart).not.toHaveBeenCalled();
    expect(
      registry.list({ cameraId: 'cam-1' }).find((j) => j.requestId === 'r2')
        ?.status,
    ).toBe('running');

    registry.markFailed('r2', 'boom');

    expect(thirdStart).toHaveBeenCalledTimes(1);
  });

  it('runs jobs for different cameras independently', () => {
    const startA = jest.fn();
    const startB = jest.fn();
    registry.enqueue({
      requestId: 'a1',
      cameraId: 'cam-a',
      kind: 'captures',
      command: 'capture',
      start: startA,
      expectedDurationMs: 10_000,
    });
    registry.enqueue({
      requestId: 'b1',
      cameraId: 'cam-b',
      kind: 'captures',
      command: 'capture',
      start: startB,
      expectedDurationMs: 10_000,
    });

    expect(startA).toHaveBeenCalledTimes(1);
    expect(startB).toHaveBeenCalledTimes(1);
  });

  it('rejects enqueueing a requestId that is already tracked', () => {
    registry.enqueue({
      requestId: 'dup',
      cameraId: 'cam-1',
      kind: 'captures',
      command: 'capture',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });

    expect(() =>
      registry.enqueue({
        requestId: 'dup',
        cameraId: 'cam-1',
        kind: 'captures',
        command: 'capture',
        start: jest.fn(),
        expectedDurationMs: 10_000,
      }),
    ).toThrow(ConflictException);
  });

  it('cancels a queued job and does not run it', () => {
    registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });
    const secondStart = jest.fn();
    registry.enqueue({
      requestId: 'r2',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: secondStart,
      expectedDurationMs: 10_000,
    });

    const cancelled = registry.cancel('r2');
    expect(cancelled.status).toBe('cancelled');
    expect(registry.getPerCameraQueue('cam-1')).toEqual([]);

    registry.markDone('r1');
    expect(secondStart).not.toHaveBeenCalled();
  });

  it('refuses to cancel a running job with a conflict', () => {
    registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'captures',
      command: 'capture',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });

    expect(() => registry.cancel('r1')).toThrow(ConflictException);
  });

  it('refuses to cancel an already-terminal job with a conflict', () => {
    registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'captures',
      command: 'capture',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });
    registry.markDone('r1');

    expect(() => registry.cancel('r1')).toThrow(ConflictException);
  });

  it('throws NotFoundException when cancelling an unknown requestId', () => {
    expect(() => registry.cancel('missing')).toThrow(NotFoundException);
  });

  it('filters list() by cameraId', () => {
    registry.enqueue({
      requestId: 'a1',
      cameraId: 'cam-a',
      kind: 'captures',
      command: 'capture',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });
    registry.enqueue({
      requestId: 'b1',
      cameraId: 'cam-b',
      kind: 'captures',
      command: 'capture',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });

    expect(
      registry.list({ cameraId: 'cam-a' }).map((j) => j.requestId),
    ).toEqual(['a1']);
    expect(
      registry
        .list()
        .map((j) => j.requestId)
        .sort(),
    ).toEqual(['a1', 'b1']);
  });

  it('ignores markDone/markFailed for unknown or already-terminal requestIds', () => {
    expect(() => registry.markDone('missing')).not.toThrow();
    expect(() => registry.markFailed('missing', 'x')).not.toThrow();

    registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'captures',
      command: 'capture',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });
    registry.markDone('r1');
    // Late/duplicate signal after the job is already terminal must not throw
    // or flip status back.
    registry.markFailed('r1', 'late failure');
    expect(
      registry.list({ cameraId: 'cam-1' }).find((j) => j.requestId === 'r1')
        ?.status,
    ).toBe('done');
  });

  it('prunes a terminal job from list() after the grace period elapses', () => {
    registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'captures',
      command: 'capture',
      start: jest.fn(),
      expectedDurationMs: 10_000,
    });
    registry.markDone('r1');

    expect(
      registry.list({ cameraId: 'cam-1' }).some((j) => j.requestId === 'r1'),
    ).toBe(true);

    jest.advanceTimersByTime(6_000);

    expect(
      registry.list({ cameraId: 'cam-1' }).some((j) => j.requestId === 'r1'),
    ).toBe(false);
  });

  it('fails a job via the watchdog if it never reaches a terminal state', () => {
    registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: jest.fn(),
      expectedDurationMs: 5_000,
    });

    jest.advanceTimersByTime(5_001);

    const job = registry
      .list({ cameraId: 'cam-1' })
      .find((j) => j.requestId === 'r1');
    expect(job?.status).toBe('failed');
    expect(job?.error).toMatch(/timed out/i);
  });

  it('promotes the next job once the watchdog fails the running one', () => {
    registry.enqueue({
      requestId: 'r1',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: jest.fn(),
      expectedDurationMs: 5_000,
    });
    const secondStart = jest.fn();
    registry.enqueue({
      requestId: 'r2',
      cameraId: 'cam-1',
      kind: 'recordings',
      command: 'start-recording',
      start: secondStart,
      expectedDurationMs: 5_000,
    });

    jest.advanceTimersByTime(5_001);

    expect(secondStart).toHaveBeenCalledTimes(1);
  });
});
