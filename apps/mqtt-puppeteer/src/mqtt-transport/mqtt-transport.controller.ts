import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { MqttTransportService } from './mqtt-transport.service';

@Controller('mqtt')
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

  @Post('commands/raw')
  @HttpCode(202)
  publishRaw(@Body() payload: unknown) {
    return this.mqtt.publish(payload);
  }

  @Post('command')
  @HttpCode(202)
  publishCommand(@Body() payload: unknown) {
    return this.mqtt.publish(payload);
  }

  @Post('request')
  @HttpCode(202)
  publishRequest(@Body() payload: unknown) {
    return this.mqtt.publish(payload);
  }
}
