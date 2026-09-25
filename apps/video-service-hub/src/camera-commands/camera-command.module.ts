import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { CameraCommandController } from './camera-command.controller';
import { CameraCommandService } from './camera-command.service';

@Module({
  imports: [StorageModule, JobsModule],
  controllers: [CameraCommandController],
  providers: [CameraCommandService],
})
export class CameraCommandModule {}
