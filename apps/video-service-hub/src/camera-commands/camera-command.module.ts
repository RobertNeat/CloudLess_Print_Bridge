import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CameraCommandController } from './camera-command.controller';
import { CameraCommandService } from './camera-command.service';

@Module({
  imports: [StorageModule],
  controllers: [CameraCommandController],
  providers: [CameraCommandService],
})
export class CameraCommandModule {}
