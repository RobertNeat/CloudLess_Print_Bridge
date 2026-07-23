import { Controller, Get, Param } from '@nestjs/common';
import { assertIdentifier } from '../common/validation';
import { MqttTelemetryStore } from './mqtt-telemetry.store';

@Controller('api/v1/cameras')
export class CameraQueryController {
  constructor(private readonly telemetry: MqttTelemetryStore) {}

  @Get()
  cameras(): Record<string, unknown> {
    const items = this.telemetry.getCameras();
    return { items, count: items.length };
  }

  @Get(':cameraId/telemetry')
  cameraTelemetry(@Param('cameraId') cameraIdValue: string) {
    const cameraId = assertIdentifier(cameraIdValue, 'cameraId');
    const items = this.telemetry.getCameraTelemetry(cameraId);
    return { cameraId, items, count: items.length };
  }
}
