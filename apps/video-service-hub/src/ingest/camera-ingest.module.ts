import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { CameraIngestController } from './camera-ingest.controller';

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [CameraIngestController],
})
export class CameraIngestModule {}
