import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { ThumbnailModule } from '../thumbnails/thumbnail.module';
import { TranscodingModule } from '../transcoding/transcoding.module';
import { CameraIngestController } from './camera-ingest.controller';

@Module({
  imports: [StorageModule, ThumbnailModule, TranscodingModule, JobsModule],
  controllers: [CameraIngestController],
})
export class CameraIngestModule {}
