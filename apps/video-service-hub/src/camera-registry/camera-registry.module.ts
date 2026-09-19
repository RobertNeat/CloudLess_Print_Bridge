import { Module } from '@nestjs/common';
import { CameraRegistryController } from './camera-registry.controller';
import { CameraRegistryService } from './camera-registry.service';

@Module({
  controllers: [CameraRegistryController],
  providers: [CameraRegistryService],
  exports: [CameraRegistryService],
})
export class CameraRegistryModule {}
