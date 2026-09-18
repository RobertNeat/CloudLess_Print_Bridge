import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ThumbnailModule } from '../thumbnails/thumbnail.module';
import { TranscodingModule } from '../transcoding/transcoding.module';
import { CameraIngestController } from './camera-ingest.controller';

@Module({
  imports: [StorageModule, ThumbnailModule, TranscodingModule],
  controllers: [CameraIngestController],
})
export class CameraIngestModule {}
