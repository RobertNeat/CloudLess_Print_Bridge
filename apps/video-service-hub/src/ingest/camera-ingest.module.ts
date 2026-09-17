import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ThumbnailModule } from '../thumbnails/thumbnail.module';
import { CameraIngestController } from './camera-ingest.controller';

@Module({
  imports: [StorageModule, AuthModule, ThumbnailModule],
  controllers: [CameraIngestController],
})
export class CameraIngestModule {}
