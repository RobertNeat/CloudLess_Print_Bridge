import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { DeviceConfigController } from './device-config.controller';

@Module({
  imports: [CommandsModule],
  controllers: [DeviceConfigController],
})
export class DeviceConfigModule {}
