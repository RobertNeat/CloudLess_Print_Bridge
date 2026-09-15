import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { assertIdentifier } from '../common/validation';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { AuthTokenService } from './auth-token.service';
import type { AccessTokenClaims, AuthenticatedUser } from './auth.types';
import type { MediaFileKind } from './media-token.service';
import { MediaTokenService } from './media-token.service';
import { StreamTokenService } from './stream-token.service';

const mediaFileKinds = new Set<MediaFileKind>([
  'recording',
  'recording-mp4',
  'capture',
  'audio',
  'live-recording',
]);

const DEFAULT_PERMISSIONS = [
  'dashboard.view',
  'printer.control',
  'printer.configure',
  'files.read',
  'files.upload',
  'files.download',
  'files.manage',
];

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly tokens: AuthTokenService,
    private readonly streamTokens: StreamTokenService,
    private readonly mediaTokens: MediaTokenService,
  ) {}

  @Get('config')
  getConfig() {
    const { mode, serviceName, tokenIssuerOrder, tokenTtlSeconds } =
      this.config.auth;
    return { mode, serviceName, tokenIssuerOrder, tokenTtlSeconds };
  }

  @Post('token')
  createToken(
    @Headers('x-cloudless-auth-key') authKey: string | undefined,
    @Body() body: Partial<AuthenticatedUser>,
  ) {
    if (
      this.config.auth.mode !== 'disabled' &&
      authKey !== this.config.auth.sharedSecret
    ) {
      throw new UnauthorizedException('Invalid authentication key.');
    }

    const user: AuthenticatedUser = {
      userId: body.userId?.trim() || 'local-user',
      displayName: body.displayName?.trim() || 'Local User',
      permissions: body.permissions?.length
        ? body.permissions
        : DEFAULT_PERMISSIONS,
    };

    return {
      accessToken: this.tokens.createAccessToken(this.config.auth, user),
      tokenType: 'Bearer',
      expiresIn: this.config.auth.tokenTtlSeconds,
      user,
    };
  }

  @Post('stream-token')
  createStreamToken(
    @Req() request: Request & { user?: AccessTokenClaims },
    @Body() body: { cameraId?: unknown },
  ) {
    const cameraId = assertIdentifier(body?.cameraId, 'cameraId');
    const userId = request.user?.sub ?? 'local-user';
    const { token, expiresIn } = this.streamTokens.issue(userId, cameraId);
    return { streamToken: token, expiresIn };
  }

  @Post('media-token')
  createMediaToken(
    @Body()
    body: {
      kind?: unknown;
      cameraId?: unknown;
      requestId?: unknown;
      fileName?: unknown;
    },
  ) {
    if (
      typeof body?.kind !== 'string' ||
      !mediaFileKinds.has(body.kind as MediaFileKind)
    ) {
      throw new UnauthorizedException(
        'kind must be one of: recording, recording-mp4, capture, audio, live-recording.',
      );
    }
    const cameraId = assertIdentifier(body?.cameraId, 'cameraId');
    const requestId = assertIdentifier(body?.requestId, 'requestId');
    const fileName =
      typeof body?.fileName === 'string' ? body.fileName : undefined;
    const { token, expiresIn } = this.mediaTokens.issue({
      kind: body.kind as MediaFileKind,
      cameraId,
      requestId,
      fileName,
    });
    return { mediaToken: token, expiresIn };
  }
}
