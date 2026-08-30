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
      isPublicPath(path)
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

function isPublicPath(path: string): boolean {
  return path.startsWith('/auth/') || path === '/auth';
}

function readBearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
