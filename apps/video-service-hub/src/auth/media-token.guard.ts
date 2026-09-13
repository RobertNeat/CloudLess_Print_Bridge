import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import type { MediaFileKind } from './media-token.service';
import { MediaTokenService } from './media-token.service';

interface MediaFileRequest {
  params?: { cameraId?: string; requestId?: string };
  query?: { mediaToken?: string; fileName?: string };
}

const kindByPath: { pattern: RegExp; kind: MediaFileKind }[] = [
  { pattern: /^\/api\/v1\/recordings\/[^/]+\/[^/]+\/file$/, kind: 'recording' },
  { pattern: /^\/api\/v1\/captures\/[^/]+\/[^/]+\/file$/, kind: 'capture' },
  {
    pattern: /^\/api\/v1\/live-recordings\/[^/]+\/[^/]+\/file$/,
    kind: 'live-recording',
  },
  { pattern: /^\/api\/v1\/audio\/[^/]+\/[^/]+\/file$/, kind: 'audio' },
];

/**
 * Guards the media file-serve routes, consumed by plain <img>/<audio src>
 * elements that cannot carry an Authorization header. Mirrors
 * StreamTokenGuard: a media token (issued via the Bearer-protected
 * POST /auth/media-token) is verified once when the response starts, and is
 * never re-checked mid-stream.
 */
@Injectable()
export class MediaTokenGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly mediaTokens: MediaTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.auth.mode === 'disabled') {
      return true;
    }
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<
      MediaFileRequest & { path?: string; url?: string }
    >();
    const path = request.path ?? request.url ?? '';
    const kind = kindByPath.find(({ pattern }) => pattern.test(path))?.kind;
    const cameraId = request.params?.cameraId;
    const requestId = request.params?.requestId;
    const token = request.query?.mediaToken;

    if (!kind || !cameraId || !requestId || !token) {
      if (this.config.auth.mode === 'optional') return true;
      throw new UnauthorizedException(
        'A mediaToken query parameter is required.',
      );
    }

    this.mediaTokens.acquire(token, {
      kind,
      cameraId,
      requestId,
      fileName: request.query?.fileName,
    });
    return true;
  }
}
