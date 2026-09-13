import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { AuthTokenService } from './auth-token.service';
import type { AccessTokenClaims } from './auth.types';

interface AuthenticatedRequest {
  method: string;
  path?: string;
  url?: string;
  headers?: {
    authorization?: string;
  };
  user?: AccessTokenClaims;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly tokens: AuthTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path = request.path ?? request.url ?? '';
    if (
      this.config.auth.mode === 'disabled' ||
      request.method === 'OPTIONS' ||
      isPublicPath(path, request.method)
    ) {
      return true;
    }

    const bearerToken = readBearerToken(request.headers?.authorization);
    if (!bearerToken) {
      if (this.config.auth.mode === 'optional') return true;
      throw new UnauthorizedException('Missing bearer token.');
    }

    request.user = this.tokens.verifyAccessToken(this.config.auth, bearerToken);
    return true;
  }
}

const publicAuthPaths = new Set(['/auth/config', '/auth/token']);
const liveViewPathPattern = /^\/api\/v1\/cameras\/[^/]+\/live$/;
const mediaFilePathPatterns = [
  /^\/api\/v1\/recordings\/[^/]+\/[^/]+\/file$/,
  /^\/api\/v1\/captures\/[^/]+\/[^/]+\/file$/,
  /^\/api\/v1\/live-recordings\/[^/]+\/[^/]+\/file$/,
  /^\/api\/v1\/audio\/[^/]+\/[^/]+\/file$/,
];

function isPublicPath(path: string, method: string): boolean {
  if (publicAuthPaths.has(path) || path.startsWith('/health')) {
    return true;
  }
  if (method !== 'GET') {
    return false;
  }
  // GET .../live is consumed by a plain <img src>, which cannot send an
  // Authorization header; it is instead protected by StreamTokenGuard using a
  // short-lived ?streamToken= issued through the (Bearer-protected)
  // POST /auth/stream-token endpoint.
  if (liveViewPathPattern.test(path)) {
    return true;
  }
  // Media file routes are likewise consumed by plain <img>/<audio src>
  // elements and are instead protected by MediaTokenGuard using a
  // ?mediaToken= issued through the (Bearer-protected)
  // POST /auth/media-token endpoint.
  return mediaFilePathPatterns.some((pattern) => pattern.test(path));
}

function readBearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
