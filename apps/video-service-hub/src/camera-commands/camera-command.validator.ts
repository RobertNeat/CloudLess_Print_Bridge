import { BadRequestException } from '@nestjs/common';
import {
  assertCameraBaseUrl,
  assertIdentifier,
  assertInteger,
  assertOptionalBoolean,
  assertResolution,
} from '../common/validation';
import { cameraCommandPaths, type CameraCommand } from './camera-command.types';

const maxOperationDurationMs = 3_600_000;
/**
 * 24h. Was 600_000 (10 minutes) until a caller needed to watch a live feed
 * for an entire print — the hub itself has no concept of "how long is
 * reasonable" beyond bounding session lifetime server-side, so this ceiling
 * exists purely to guarantee every live session eventually self-reaps
 * (activeLive entry cleared, viewers ended) even if the client that started
 * it never calls stop-live (tab closed, browser crashed, network dropped).
 * Every caller must always send an explicit maxDurationMs within this
 * ceiling — see CameraCommandApiService.startLive on the frontend.
 */
const maxLiveDurationMs = 86_400_000;

export function parseCameraCommand(value: string): CameraCommand {
  if (!(value in cameraCommandPaths)) {
    throw new BadRequestException('unsupported camera command');
  }
  return value as CameraCommand;
}

export function parseCameraBaseUrl(value: unknown): string {
  try {
    return assertCameraBaseUrl(value);
  } catch {
    throw new BadRequestException('cameraBaseUrl must be an HTTP origin');
  }
}

export function validateCommandPayload(
  command: CameraCommand,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...input };
  delete payload.cameraBaseUrl;

  switch (command) {
    case 'capture':
      validateRequestAndResolution(payload);
      break;
    case 'periodic-capture':
      validateRequestAndResolution(payload);
      assertInteger(
        payload.intervalMs,
        'intervalMs',
        250,
        maxOperationDurationMs,
      );
      assertInteger(
        payload.durationMs,
        'durationMs',
        1,
        maxOperationDurationMs,
      );
      break;
    case 'timed-recording':
      validateRequestAndResolution(payload);
      assertInteger(
        payload.durationMs,
        'durationMs',
        1,
        maxOperationDurationMs,
      );
      break;
    case 'start-recording':
      validateRequestAndResolution(payload);
      if (payload.maxDurationMs !== undefined) {
        assertInteger(
          payload.maxDurationMs,
          'maxDurationMs',
          1,
          maxOperationDurationMs,
        );
      }
      break;
    case 'start-live':
      validateRequestAndResolution(payload);
      validateLiveDuration(payload);
      assertOptionalBoolean(payload.persist, 'persist');
      break;
    case 'start-dynamic-live':
      assertIdentifier(payload.requestId, 'requestId');
      if (payload.resolution !== undefined) {
        assertResolution(payload.resolution);
      }
      validateLiveDuration(payload);
      assertOptionalBoolean(payload.persist, 'persist');
      break;
    case 'stop-recording':
    case 'stop-live':
      if (payload.requestId !== undefined) {
        assertIdentifier(payload.requestId, 'requestId');
      }
      break;
    case 'record-audio':
      assertIdentifier(payload.requestId, 'requestId');
      assertInteger(payload.durationSeconds, 'durationSeconds', 1, 20);
      break;
  }

  return payload;
}

function validateRequestAndResolution(payload: Record<string, unknown>): void {
  assertIdentifier(payload.requestId, 'requestId');
  assertResolution(payload.resolution);
}

function validateLiveDuration(payload: Record<string, unknown>): void {
  if (payload.maxDurationMs !== undefined) {
    assertInteger(payload.maxDurationMs, 'maxDurationMs', 1, maxLiveDurationMs);
  }
}
