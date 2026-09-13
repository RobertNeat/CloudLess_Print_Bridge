import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CameraCommandModule } from './camera-commands/camera-command.module';
import { CameraRegistryModule } from './camera-registry/camera-registry.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { CameraIngestModule } from './ingest/camera-ingest.module';
import { MediaLibraryModule } from './media-library/media-library.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CameraRegistryModule,
    CameraCommandModule,
    CameraIngestModule,
    MediaLibraryModule,
    HealthModule,
  ],
})
export class AppModule {}
