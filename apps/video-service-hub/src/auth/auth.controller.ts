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
import { StreamTokenService } from './stream-token.service';

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
}
