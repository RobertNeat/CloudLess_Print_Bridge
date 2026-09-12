import { HttpErrorResponse } from '@angular/common/http';
import type { BackendErrorBody } from './mqtt-puppeteer-api.types';

export type CommandErrorKind = 'validation' | 'unavailable' | 'network' | 'forbidden' | 'unknown';

export interface CommandError {
  readonly kind: CommandErrorKind;
  readonly message: string;
  readonly operationId?: string;
}

export class CommandExecutionError extends Error {
  constructor(readonly error: CommandError) {
    super(error.message);
    this.name = 'CommandExecutionError';
  }
}

function isBackendErrorBody(value: unknown): value is BackendErrorBody {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Partial<BackendErrorBody>).message === 'string'
  );
}

/**
 * Maps a failed HTTP call to mqtt-puppeteer into the CommandError shape the
 * dashboard's error banner understands. Every real backend adapter method
 * funnels its catch block through this so error handling stays consistent
 * regardless of which endpoint failed.
 */
export function mapHttpError(error: unknown): CommandError {
  if (!(error instanceof HttpErrorResponse)) {
    return { kind: 'unknown', message: 'Wystąpił nieoczekiwany błąd.' };
  }

  const body = isBackendErrorBody(error.error) ? error.error : undefined;
  const operationId = body?.operationId;

  if (error.status === 0) {
    return {
      kind: 'network',
      message: 'Nie udało się połączyć z usługą mqtt-puppeteer.',
      operationId,
    };
  }
  if (error.status === 400) {
    return {
      kind: 'validation',
      message: body?.message ?? 'Żądanie zostało odrzucone jako nieprawidłowe.',
      operationId,
    };
  }
  if (error.status === 503) {
    return {
      kind: 'unavailable',
      message: body?.message ?? 'Usługa MQTT jest obecnie niedostępna.',
      operationId,
    };
  }
  return {
    kind: 'unknown',
    message: body?.message ?? `Nieoczekiwana odpowiedź serwera (${error.status}).`,
    operationId,
  };
}
