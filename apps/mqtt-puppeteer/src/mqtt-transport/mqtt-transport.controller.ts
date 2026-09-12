import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MqttTransportService } from './mqtt-transport.service';

@ApiTags('service')
@Controller('service')
export class MqttTransportController {
  constructor(private readonly mqtt: MqttTransportService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get the non-secret MQTT transport configuration' })
  @ApiOkResponse({ description: 'Public MQTT configuration (no password).' })
  getConfiguration() {
    return this.mqtt.getPublicConfiguration();
  }

  @Get('status')
  @ApiOperation({ summary: 'Get the current MQTT connection status' })
  @ApiOkResponse({ description: 'Connection status.' })
  getStatus() {
    return this.mqtt.getStatus();
  }

  @Get('reports/latest')
  @ApiOperation({ summary: 'Get the most recently received MQTT report' })
  @ApiOkResponse({ description: 'Latest raw report, or null if none yet.' })
  getLatestReport() {
    return this.mqtt.getLatestReport();
  }
}
