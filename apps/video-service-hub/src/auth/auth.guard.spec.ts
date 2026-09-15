import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthTokenService } from './auth-token.service';
import { loadServiceConfig } from '../config/service-config';

function contextFor(
  method: string,
  path: string,
  authorization?: string,
): ExecutionContext {
  const request = { method, path, headers: { authorization } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const config = loadServiceConfig({
    VIDEO_SERVICE_HUB_MQTT_PORT: '0',
    CLOUDLESS_AUTH_MODE: 'required',
    CLOUDLESS_AUTH_SHARED_SECRET: 'secret',
  });
  const guard = new AuthGuard(config, new AuthTokenService());

  it('requires a bearer token on an ordinary API route', () => {
    expect(() =>
      guard.canActivate(contextFor('GET', '/api/v1/cameras')),
    ).toThrow(UnauthorizedException);
  });

  it.each([
    ['GET', '/api/v1/recordings/camera-1/req-1/file'],
    ['GET', '/api/v1/recordings/camera-1/req-1/mp4'],
    ['GET', '/api/v1/captures/camera-1/req-1/file'],
    ['GET', '/api/v1/live-recordings/camera-1/req-1/file'],
    ['GET', '/api/v1/audio/camera-1/req-1/file'],
    ['GET', '/api/v1/cameras/camera-1/live'],
  ])(
    'treats %s %s as public (delegated to its own token guard), not rejected for a missing bearer token',
    (method, path) => {
      expect(guard.canActivate(contextFor(method, path))).toBe(true);
    },
  );

  it('does NOT treat the mp4 transcode trigger (POST) as public — it still needs a bearer token', () => {
    expect(() =>
      guard.canActivate(
        contextFor('POST', '/api/v1/recordings/camera-1/req-1/transcode'),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a GET to a similarly-shaped but non-listed path', () => {
    expect(() =>
      guard.canActivate(
        contextFor('GET', '/api/v1/recordings/camera-1/req-1/unknown-suffix'),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('allows /auth/token and /health without a bearer token', () => {
    expect(guard.canActivate(contextFor('POST', '/auth/token'))).toBe(true);
    expect(guard.canActivate(contextFor('GET', '/health'))).toBe(true);
  });

  it('accepts a valid bearer token on an ordinary route', () => {
    const tokens = new AuthTokenService();
    const accessToken = tokens.createAccessToken(config.auth, {
      userId: 'user-1',
      displayName: 'User',
      permissions: [],
    });
    const guardWithSameTokens = new AuthGuard(config, tokens);
    expect(
      guardWithSameTokens.canActivate(
        contextFor('GET', '/api/v1/cameras', `Bearer ${accessToken}`),
      ),
    ).toBe(true);
  });
});
