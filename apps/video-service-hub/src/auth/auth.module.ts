import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthTokenService } from './auth-token.service';
import { StreamTokenGuard } from './stream-token.guard';
import { StreamTokenService } from './stream-token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthTokenService,
    StreamTokenService,
    StreamTokenGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthTokenService, StreamTokenService, StreamTokenGuard],
})
export class AuthModule {}
