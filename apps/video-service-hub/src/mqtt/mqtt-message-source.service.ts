import { Inject, Injectable, Logger } from '@nestjs/common';
import { connect, type MqttClient } from 'mqtt';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import type {
  MqttBrokerEndpoint,
  MqttMessageSource,
  MqttMessageSourceStatus,
  ObservedMqttMessage,
} from './mqtt.ports';

@Injectable()
export class MqttJsMessageSource implements MqttMessageSource {
  private readonly logger = new Logger(MqttJsMessageSource.name);
  private client: MqttClient | null = null;
  private brokerUrl = '';
  private topicFilter: string | null = null;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: ServiceConfig) {}

  async start(
    endpoint: MqttBrokerEndpoint,
    topicFilter: string,
    handler: (message: ObservedMqttMessage) => void,
  ): Promise<void> {
    if (this.client) {
      throw new Error('MQTT message source is already started');
    }
    this.brokerUrl = endpoint.url;
    this.topicFilter = topicFilter;
    const client = connect(endpoint.url, {
      clientId: `video-service-hub-observer-${process.pid}`,
      clean: true,
      connectTimeout: this.config.mqtt.connectTimeoutMs,
      reconnectPeriod: this.config.mqtt.reconnectPeriodMs,
      username: endpoint.username,
      password: endpoint.password,
    });
    this.client = client;
    client.on('message', (topic, payload, packet) =>
      handler({
        topic,
        payload,
        qos: packet.qos,
        retain: packet.retain,
      }),
    );
    client.on('error', (error) =>
      this.logger.warn(`MQTT observer error: ${error.message}`),
    );

    try {
      await this.waitForConnection(client);
      await client.subscribeAsync(topicFilter, { qos: 2 });
    } catch (error) {
      await this.stop();
      throw error;
    }
    this.logger.log(
      `MQTT observer connected to ${sanitizeBrokerUrl(endpoint.url)}`,
    );
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client) {
      await client.endAsync();
    }
  }

  getStatus(): MqttMessageSourceStatus {
    return {
      connected: this.client?.connected ?? false,
      reconnecting: this.client?.reconnecting ?? false,
      clientId: this.client?.options.clientId ?? null,
      brokerUrl: sanitizeBrokerUrl(this.brokerUrl),
      subscription: this.topicFilter,
    };
  }

  private waitForConnection(client: MqttClient): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `MQTT connection timed out after ${this.config.mqtt.connectTimeoutMs} ms`,
          ),
        );
      }, this.config.mqtt.connectTimeoutMs);
      const connected = () => {
        cleanup();
        resolve();
      };
      const failed = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        clearTimeout(timeout);
        client.off('connect', connected);
        client.off('error', failed);
      };
      client.once('connect', connected);
      client.once('error', failed);
    });
  }
}

function sanitizeBrokerUrl(value: string): string {
  if (!value) {
    return '';
  }
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return '<invalid MQTT URL>';
  }
}
