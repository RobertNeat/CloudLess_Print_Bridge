import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CameraIngestController } from './camera-ingest.controller';

@Module({
  imports: [StorageModule],
  controllers: [CameraIngestController],
})
export class CameraIngestModule {}
