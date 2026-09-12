import { HttpErrorResponse } from '@angular/common/http';
import { mapHttpError } from './http-error-mapping';

describe('mapHttpError', () => {
  it('maps a 400 with a backend message to a validation error', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { statusCode: 400, message: 'z must be at most 240', operationId: 'op-1' },
    });

    expect(mapHttpError(error)).toEqual({
      kind: 'validation',
      message: 'z must be at most 240',
      operationId: 'op-1',
    });
  });

  it('maps a 503 to an unavailable error', () => {
    const error = new HttpErrorResponse({
      status: 503,
      error: { statusCode: 503, message: 'MQTT client is not connected', operationId: 'op-2' },
    });

    expect(mapHttpError(error)).toEqual({
      kind: 'unavailable',
      message: 'MQTT client is not connected',
      operationId: 'op-2',
    });
  });

  it('maps a status-0 response to a network error', () => {
    const error = new HttpErrorResponse({ status: 0 });

    expect(mapHttpError(error).kind).toBe('network');
  });

  it('maps an unrecognized status to unknown while preserving the message', () => {
    const error = new HttpErrorResponse({
      status: 500,
      error: { statusCode: 500, message: 'boom' },
    });

    expect(mapHttpError(error)).toEqual({
      kind: 'unknown',
      message: 'boom',
      operationId: undefined,
    });
  });

  it('maps a non-HttpErrorResponse to unknown without throwing', () => {
    expect(mapHttpError(new Error('not an http error')).kind).toBe('unknown');
  });
});
