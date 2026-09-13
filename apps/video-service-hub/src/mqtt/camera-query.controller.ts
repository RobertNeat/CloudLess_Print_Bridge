import { Controller, Get, Param } from '@nestjs/common';
import { CameraRegistryService } from '../camera-registry/camera-registry.service';
import { assertIdentifier } from '../common/validation';
import { MqttTelemetryStore } from './mqtt-telemetry.store';

@Controller('api/v1/cameras')
export class CameraQueryController {
  constructor(
    private readonly telemetry: MqttTelemetryStore,
    private readonly registry: CameraRegistryService,
  ) {}

  @Get()
  cameras(): Record<string, unknown> {
    const known = new Map(
      this.telemetry.getCameras().map((camera) => [camera.cameraId, camera]),
    );
    for (const entry of this.registry.list()) {
      if (!known.has(entry.cameraId)) {
        known.set(entry.cameraId, {
          cameraId: entry.cameraId,
          firstSeenAt: entry.createdAt,
          lastSeenAt: entry.createdAt,
          lastHeartbeatAt: null,
          lastChannel: '',
          messageCount: 0,
          online: false,
        });
      }
    }
    const items = [...known.values()].map((camera) => {
      const registration = this.registry.tryGet(camera.cameraId);
      return {
        ...camera,
        baseUrl: registration?.baseUrl,
        displayName: registration?.displayName,
        locationCode: registration?.locationCode,
      };
    });
    return { items, count: items.length };
  }

  @Get(':cameraId/telemetry')
  cameraTelemetry(@Param('cameraId') cameraIdValue: string) {
    const cameraId = assertIdentifier(cameraIdValue, 'cameraId');
    const items = this.telemetry.getCameraTelemetry(cameraId);
    return { cameraId, items, count: items.length };
  }
}
