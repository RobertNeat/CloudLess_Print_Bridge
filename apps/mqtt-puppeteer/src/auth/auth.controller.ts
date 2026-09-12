import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AuthTokenService } from './auth-token.service';
import type { AuthenticatedUser } from './auth.types';

const DEFAULT_PERMISSIONS = [
  'dashboard.view',
  'printer.control',
  'printer.configure',
  'files.read',
  'files.upload',
  'files.download',
  'files.manage',
];

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly tokens: AuthTokenService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Get the non-secret auth configuration' })
  @ApiOkResponse({ description: 'Auth mode, service name, ttl.' })
  getConfig() {
    const { mode, serviceName, tokenIssuerOrder, tokenTtlSeconds } =
      this.config.auth;
    return { mode, serviceName, tokenIssuerOrder, tokenTtlSeconds };
  }

  @Post('token')
  @ApiOperation({
    summary: 'Issue a bearer access token for a dashboard session',
  })
  @ApiOkResponse({ description: 'Access token, ttl, resolved user session.' })
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
}
