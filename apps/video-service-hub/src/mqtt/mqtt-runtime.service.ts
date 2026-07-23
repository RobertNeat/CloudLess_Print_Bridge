import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  MQTT_BROKER_ENDPOINT,
  MQTT_MESSAGE_SOURCE,
  type MqttBrokerEndpointProvider,
  type MqttMessageSource,
} from './mqtt.ports';
import { MqttTelemetryStore } from './mqtt-telemetry.store';

@Injectable()
export class MqttRuntimeService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(MQTT_BROKER_ENDPOINT)
    private readonly broker: MqttBrokerEndpointProvider,
    @Inject(MQTT_MESSAGE_SOURCE)
    private readonly source: MqttMessageSource,
    private readonly telemetry: MqttTelemetryStore,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const endpoint = await this.broker.open();
      await this.source.start(endpoint, 'cameras/+/+', (message) =>
        this.telemetry.record(message),
      );
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.stop();
  }

  getStatus(): Record<string, unknown> {
    return {
      mode: this.broker.mode,
      observer: this.source.getStatus(),
      broker: this.broker.getStatus(),
      ...this.telemetry.getCounts(),
    };
  }

  private async stop(): Promise<void> {
    await this.source.stop();
    await this.broker.close();
  }
}
