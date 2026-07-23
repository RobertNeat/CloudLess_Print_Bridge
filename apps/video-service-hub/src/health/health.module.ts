import { Module } from '@nestjs/common';
import { MqttModule } from '../mqtt/mqtt.module';
import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';

@Module({
  imports: [StorageModule, MqttModule],
  controllers: [HealthController],
})
export class HealthModule {}
