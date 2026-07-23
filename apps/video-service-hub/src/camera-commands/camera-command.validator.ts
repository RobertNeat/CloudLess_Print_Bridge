import { BadRequestException } from '@nestjs/common';
import {
  assertIdentifier,
  assertInteger,
  assertResolution,
} from '../common/validation';
import { cameraCommandPaths, type CameraCommand } from './camera-command.types';

const maxOperationDurationMs = 3_600_000;
const maxLiveDurationMs = 600_000;

export function parseCameraCommand(value: string): CameraCommand {
  if (!(value in cameraCommandPaths)) {
    throw new BadRequestException('unsupported camera command');
  }
  return value as CameraCommand;
}

export function parseCameraBaseUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('cameraBaseUrl is required');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('cameraBaseUrl is invalid');
  }
  if (
    url.protocol !== 'http:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new BadRequestException('cameraBaseUrl must be an HTTP origin');
  }
  return url.origin;
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
      break;
    case 'start-dynamic-live':
      assertIdentifier(payload.requestId, 'requestId');
      if (payload.resolution !== undefined) {
        assertResolution(payload.resolution);
      }
      validateLiveDuration(payload);
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
