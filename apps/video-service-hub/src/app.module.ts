import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CameraCommandModule } from './camera-commands/camera-command.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { CameraIngestModule } from './ingest/camera-ingest.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CameraCommandModule,
    CameraIngestModule,
    HealthModule,
  ],
})
export class AppModule {}
