import { UnauthorizedException } from '@nestjs/common';
import { loadServiceConfig } from '../config/service-config';
import type { MediaFileKind } from './media-token.service';
import { AuthController } from './auth.controller';
import { AuthTokenService } from './auth-token.service';
import { MediaTokenService } from './media-token.service';
import { StreamTokenService } from './stream-token.service';

// Every kind MediaTokenGuard's kindByPath routes to (media-token.guard.ts)
// must also be accepted here, or createMediaToken rejects a request the
// guard would otherwise allow through -- exactly the bug this file guards
// against (capture-mp4 was added to the guard and MediaFileKind but not to
// this controller's own allowlist).
const allMediaFileKinds: MediaFileKind[] = [
  'recording',
  'recording-mp4',
  'capture',
  'capture-mp4',
  'audio',
  'live-recording',
];

describe('AuthController.createMediaToken', () => {
  let controller: AuthController;

  beforeEach(() => {
    const config = loadServiceConfig({ VIDEO_SERVICE_HUB_MQTT_PORT: '0' });
    controller = new AuthController(
      config,
      new AuthTokenService(),
      new StreamTokenService(),
      new MediaTokenService(),
    );
  });

  it.each(allMediaFileKinds)('issues a token for kind %s', (kind) => {
    const result = controller.createMediaToken({
      kind,
      cameraId: 'camera-1',
      requestId: 'req-1',
    });
    expect(result.mediaToken).toBeTruthy();
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      controller.createMediaToken({
        kind: 'not-a-real-kind',
        cameraId: 'camera-1',
        requestId: 'req-1',
      }),
    ).toThrow(UnauthorizedException);
  });
});
