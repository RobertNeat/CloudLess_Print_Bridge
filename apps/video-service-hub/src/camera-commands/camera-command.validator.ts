import { BadRequestException } from '@nestjs/common';
import {
  assertCameraBaseUrl,
  assertIdentifier,
  assertInteger,
  assertOptionalBoolean,
  assertResolution,
} from '../common/validation';
import { cameraCommandPaths, type CameraCommand } from './camera-command.types';

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

export type ValidateCommandPayloadOptions = {
  timelapseMaxDurationMs: number;
  /** Ceiling for timed-recording's durationMs and start-recording's maxDurationMs. */
  recordingMaxDurationMs: number;
  liveMaxDurationMs: number;
  /** Ceiling for periodic-capture's intervalMs. */
  intervalMaxDurationMs: number;
};

export function validateCommandPayload(
  command: CameraCommand,
  input: Record<string, unknown>,
  {
    timelapseMaxDurationMs,
    recordingMaxDurationMs,
    liveMaxDurationMs,
    intervalMaxDurationMs,
  }: ValidateCommandPayloadOptions,
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
        // Never exceeds the timelapse duration cap even when that cap is lowered below the interval cap.
        Math.min(intervalMaxDurationMs, timelapseMaxDurationMs),
      );
      assertInteger(
        payload.durationMs,
        'durationMs',
        1,
        timelapseMaxDurationMs,
      );
      break;
    case 'timed-recording':
      validateRequestAndResolution(payload);
      assertInteger(
        payload.durationMs,
        'durationMs',
        1,
        recordingMaxDurationMs,
      );
      break;
    case 'start-recording':
      validateRequestAndResolution(payload);
      if (payload.maxDurationMs !== undefined) {
        assertInteger(
          payload.maxDurationMs,
          'maxDurationMs',
          1,
          recordingMaxDurationMs,
        );
      }
      break;
    case 'start-live':
      validateRequestAndResolution(payload);
      validateLiveDuration(payload, liveMaxDurationMs);
      assertOptionalBoolean(payload.persist, 'persist');
      break;
    case 'start-dynamic-live':
      assertIdentifier(payload.requestId, 'requestId');
      if (payload.resolution !== undefined) {
        assertResolution(payload.resolution);
      }
      validateLiveDuration(payload, liveMaxDurationMs);
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

function validateLiveDuration(
  payload: Record<string, unknown>,
  liveMaxDurationMs: number,
): void {
  if (payload.maxDurationMs !== undefined) {
    assertInteger(payload.maxDurationMs, 'maxDurationMs', 1, liveMaxDurationMs);
  }
}
