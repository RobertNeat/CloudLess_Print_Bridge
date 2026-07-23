import { Module } from '@nestjs/common';
import { CameraCommandController } from './camera-command.controller';
import { CameraCommandService } from './camera-command.service';

@Module({
  controllers: [CameraCommandController],
  providers: [CameraCommandService],
})
export class CameraCommandModule {}
