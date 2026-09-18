import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ThumbnailModule } from '../thumbnails/thumbnail.module';
import { TranscodingModule } from '../transcoding/transcoding.module';
import { CameraIngestController } from './camera-ingest.controller';

@Module({
  imports: [StorageModule, AuthModule, ThumbnailModule, TranscodingModule],
  controllers: [CameraIngestController],
})
export class CameraIngestModule {}
