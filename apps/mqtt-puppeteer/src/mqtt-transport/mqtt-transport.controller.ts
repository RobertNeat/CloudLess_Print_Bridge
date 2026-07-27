import { Controller, Get } from '@nestjs/common';
import { MqttTransportService } from './mqtt-transport.service';

@Controller('service')
export class MqttTransportController {
  constructor(private readonly mqtt: MqttTransportService) {}

  @Get('config')
  getConfiguration() {
    return this.mqtt.getPublicConfiguration();
  }

  @Get('status')
  getStatus() {
    return this.mqtt.getStatus();
  }

  @Get('reports/latest')
  getLatestReport() {
    return this.mqtt.getLatestReport();
  }
}
