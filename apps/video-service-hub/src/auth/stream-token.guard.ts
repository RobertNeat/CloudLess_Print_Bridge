import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { StreamTokenService } from './stream-token.service';

interface StreamRequest {
  method: string;
  params?: { cameraId?: string };
  query?: { streamToken?: string };
}

/**
 * Guards the MJPEG live-view endpoint, which is consumed by a plain <img src>
 * and therefore cannot carry an Authorization header. A short-lived stream
 * token (issued via POST /auth/stream-token while the caller still holds a
 * normal bearer token) is verified once when the connection opens; it is not
 * re-checked per chunk, so it adds no latency to the stream itself.
 */
@Injectable()
export class StreamTokenGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly streamTokens: StreamTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.auth.mode === 'disabled') {
      return true;
    }
    const request = context.switchToHttp().getRequest<StreamRequest>();
    const cameraId = request.params?.cameraId;
    const token = request.query?.streamToken;
    if (!cameraId || !token) {
      if (this.config.auth.mode === 'optional') return true;
      throw new UnauthorizedException(
        'A streamToken query parameter is required.',
      );
    }
    this.streamTokens.acquire(token, cameraId);
    return true;
  }
}
