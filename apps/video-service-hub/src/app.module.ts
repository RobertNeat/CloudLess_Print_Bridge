import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CameraCommandModule } from './camera-commands/camera-command.module';
import { CameraRegistryModule } from './camera-registry/camera-registry.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { CameraIngestModule } from './ingest/camera-ingest.module';
import { JobsModule } from './jobs/jobs.module';
import { MediaLibraryModule } from './media-library/media-library.module';
import { TranscodingModule } from './transcoding/transcoding.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CameraRegistryModule,
    JobsModule,
    CameraCommandModule,
    CameraIngestModule,
    MediaLibraryModule,
    TranscodingModule,
    HealthModule,
  ],
})
export class AppModule {}
