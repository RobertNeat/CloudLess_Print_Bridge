import { Inject, Injectable } from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import type {
  MqttBrokerEndpoint,
  MqttBrokerEndpointProvider,
  MqttBrokerStatus,
} from './mqtt.ports';

const protocols = new Set(['mqtt:', 'mqtts:', 'ws:', 'wss:']);

@Injectable()
export class ExternalMqttBrokerService implements MqttBrokerEndpointProvider {
  readonly mode = 'external' as const;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: ServiceConfig) {}

  open(): Promise<MqttBrokerEndpoint> {
    const value = this.config.mqtt.externalUrl;
    if (!value) {
      throw new Error(
        'VIDEO_SERVICE_HUB_MQTT_URL is required for external broker mode',
      );
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('VIDEO_SERVICE_HUB_MQTT_URL must be a valid URL');
    }
    if (!protocols.has(url.protocol)) {
      throw new Error(
        'VIDEO_SERVICE_HUB_MQTT_URL must use mqtt, mqtts, ws, or wss',
      );
    }
    return Promise.resolve({
      url: value,
      username: this.config.mqtt.username,
      password: this.config.mqtt.password,
    });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  getStatus(): MqttBrokerStatus {
    return { managedByApplication: false };
  }
}
