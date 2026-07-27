import { Module } from '@nestjs/common';
import { MqttTransportController } from './mqtt-transport.controller';
import { MqttTransportService } from './mqtt-transport.service';

@Module({
  controllers: [MqttTransportController],
  providers: [MqttTransportService],
  exports: [MqttTransportService],
})
export class MqttTransportModule {}
