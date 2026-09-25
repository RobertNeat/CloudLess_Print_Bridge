import { Module } from '@nestjs/common';
import { CameraRegistryModule } from '../camera-registry/camera-registry.module';
import { JobRegistryService } from './job-registry.service';
import { JobsController } from './jobs.controller';

@Module({
  imports: [CameraRegistryModule],
  controllers: [JobsController],
  providers: [JobRegistryService],
  exports: [JobRegistryService],
})
export class JobsModule {}
