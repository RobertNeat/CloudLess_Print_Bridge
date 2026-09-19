import { UnauthorizedException } from '@nestjs/common';
import { StreamTokenService } from './stream-token.service';

describe('StreamTokenService', () => {
  let service: StreamTokenService;

  beforeEach(() => {
    service = new StreamTokenService();
  });

  it('issues a token that can be acquired for the matching camera', () => {
    const { token } = service.issue('user-1', 'camera-1');
    expect(() => service.acquire(token, 'camera-1')).not.toThrow();
  });

  it('rejects a token used for a different camera', () => {
    const { token } = service.issue('user-1', 'camera-1');
    expect(() => service.acquire(token, 'camera-2')).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown token', () => {
    expect(() => service.acquire('does-not-exist', 'camera-1')).toThrow(
      UnauthorizedException,
    );
  });

  it('allows the same token to be acquired by multiple concurrent viewers', () => {
    const { token } = service.issue('user-1', 'camera-1');
    expect(() => service.acquire(token, 'camera-1')).not.toThrow();
    expect(() => service.acquire(token, 'camera-1')).not.toThrow();
    service.releaseViewer(token);
    // Still valid: one viewer released, another still holds the token.
    expect(() => service.acquire(token, 'camera-1')).not.toThrow();
  });

  it('invalidates the previous token when a new one is issued for the same user/camera pair', () => {
    const first = service.issue('user-1', 'camera-1');
    const second = service.issue('user-1', 'camera-1');

    expect(() => service.acquire(first.token, 'camera-1')).toThrow(
      UnauthorizedException,
    );
    expect(() => service.acquire(second.token, 'camera-1')).not.toThrow();
  });

  it('keeps tokens independent across different cameras for the same user', () => {
    const first = service.issue('user-1', 'camera-1');
    const second = service.issue('user-1', 'camera-2');

    expect(() => service.acquire(first.token, 'camera-1')).not.toThrow();
    expect(() => service.acquire(second.token, 'camera-2')).not.toThrow();
  });
});
