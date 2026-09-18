import { Module } from '@nestjs/common';
import { CameraRegistryModule } from '../camera-registry/camera-registry.module';
import { MediaStorageService } from './media-storage.service';

@Module({
  imports: [CameraRegistryModule],
  providers: [MediaStorageService],
  exports: [MediaStorageService],
})
export class StorageModule {}
