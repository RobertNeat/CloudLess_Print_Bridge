import { UnauthorizedException } from '@nestjs/common';
import { MediaTokenService } from './media-token.service';

describe('MediaTokenService', () => {
  let service: MediaTokenService;

  beforeEach(() => {
    service = new MediaTokenService();
  });

  it('issues a token that can be acquired for the matching file', () => {
    const { token } = service.issue({
      kind: 'recording',
      cameraId: 'camera-1',
      requestId: 'req-1',
    });
    expect(() =>
      service.acquire(token, {
        kind: 'recording',
        cameraId: 'camera-1',
        requestId: 'req-1',
      }),
    ).not.toThrow();
  });

  it('rejects a token used for a different requestId', () => {
    const { token } = service.issue({
      kind: 'recording',
      cameraId: 'camera-1',
      requestId: 'req-1',
    });
    expect(() =>
      service.acquire(token, {
        kind: 'recording',
        cameraId: 'camera-1',
        requestId: 'req-2',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a token used for a different kind', () => {
    const { token } = service.issue({
      kind: 'recording',
      cameraId: 'camera-1',
      requestId: 'req-1',
    });
    expect(() =>
      service.acquire(token, {
        kind: 'audio',
        cameraId: 'camera-1',
        requestId: 'req-1',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects an unknown token', () => {
    expect(() =>
      service.acquire('does-not-exist', {
        kind: 'recording',
        cameraId: 'camera-1',
        requestId: 'req-1',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('checks fileName when the expected ref specifies one', () => {
    const { token } = service.issue({
      kind: 'capture',
      cameraId: 'camera-1',
      requestId: 'req-1',
      fileName: '000000.jpg',
    });
    expect(() =>
      service.acquire(token, {
        kind: 'capture',
        cameraId: 'camera-1',
        requestId: 'req-1',
        fileName: '000001.jpg',
      }),
    ).toThrow(UnauthorizedException);
    expect(() =>
      service.acquire(token, {
        kind: 'capture',
        cameraId: 'camera-1',
        requestId: 'req-1',
        fileName: '000000.jpg',
      }),
    ).not.toThrow();
  });

  it('allows multiple independent tokens for different files at once', () => {
    const first = service.issue({
      kind: 'recording',
      cameraId: 'camera-1',
      requestId: 'req-1',
    });
    const second = service.issue({
      kind: 'audio',
      cameraId: 'camera-1',
      requestId: 'req-2',
    });
    expect(() =>
      service.acquire(first.token, {
        kind: 'recording',
        cameraId: 'camera-1',
        requestId: 'req-1',
      }),
    ).not.toThrow();
    expect(() =>
      service.acquire(second.token, {
        kind: 'audio',
        cameraId: 'camera-1',
        requestId: 'req-2',
      }),
    ).not.toThrow();
  });
});
