import { Module } from '@nestjs/common';
import { MqttTransportController } from './mqtt-transport.controller';
import { MqttTransportService } from './mqtt-transport.service';
import { OperationTrackerService } from '../operations/operation-tracker.service';

@Module({
  controllers: [MqttTransportController],
  providers: [MqttTransportService, OperationTrackerService],
  exports: [MqttTransportService, OperationTrackerService],
})
export class MqttTransportModule {}
