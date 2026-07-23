import { Controller, Get } from '@nestjs/common';
import { MqttRuntimeService } from '../mqtt/mqtt-runtime.service';
import { MediaStorageService } from '../storage/media-storage.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly storage: MediaStorageService,
    private readonly mqtt: MqttRuntimeService,
  ) {}

  @Get()
  health(): Record<string, unknown> {
    const storage = this.storage.getStatus();
    const mqtt = this.mqtt.getStatus();
    const mqttObserver = mqtt.observer as { connected?: boolean } | undefined;
    return {
      status:
        storage.ready === true && mqttObserver?.connected === true
          ? 'ok'
          : 'degraded',
      storage,
      mqtt,
      timestamp: new Date().toISOString(),
    };
  }
}
