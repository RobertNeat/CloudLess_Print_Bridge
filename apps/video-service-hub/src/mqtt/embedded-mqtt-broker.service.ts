import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Aedes } from 'aedes';
import { createServer, type Server } from 'node:net';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import type {
  MqttBrokerEndpoint,
  MqttBrokerEndpointProvider,
  MqttBrokerStatus,
} from './mqtt.ports';

@Injectable()
export class EmbeddedMqttBrokerService implements MqttBrokerEndpointProvider {
  readonly mode = 'embedded' as const;
  private readonly logger = new Logger(EmbeddedMqttBrokerService.name);
  private broker: Aedes | null = null;
  private server: Server | null = null;
  private listeningPort = 0;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: ServiceConfig) {}

  async open(): Promise<MqttBrokerEndpoint> {
    if (this.broker || this.server) {
      return { url: `mqtt://127.0.0.1:${this.listeningPort}` };
    }
    const { Aedes: AedesBroker } = await import('aedes');
    this.broker = await AedesBroker.createBroker({
      id: 'video-service-hub',
    });
    this.server = createServer((socket) => this.broker?.handle(socket));
    try {
      await new Promise<void>((resolve, reject) => {
        this.server?.once('error', reject);
        this.server?.listen(this.config.mqtt.port, '0.0.0.0', () => {
          this.server?.off('error', reject);
          const address = this.server?.address();
          this.listeningPort =
            typeof address === 'object' && address
              ? address.port
              : this.config.mqtt.port;
          resolve();
        });
      });
    } catch (error) {
      await this.close();
      throw error;
    }
    this.logger.log(
      `Embedded MQTT broker listening on 0.0.0.0:${this.listeningPort}`,
    );
    return { url: `mqtt://127.0.0.1:${this.listeningPort}` };
  }

  async close(): Promise<void> {
    const broker = this.broker;
    const server = this.server;
    this.broker = null;
    this.server = null;
    const serverClosed =
      server?.listening === true
        ? new Promise<void>((resolve) => server.close(() => resolve()))
        : Promise.resolve();
    if (broker) {
      await new Promise<void>((resolve) => broker.close(() => resolve()));
    }
    await serverClosed;
    this.listeningPort = 0;
  }

  getStatus(): MqttBrokerStatus {
    return {
      managedByApplication: true,
      listening: this.server?.listening ?? false,
      host: '0.0.0.0',
      port: this.listeningPort,
    };
  }
}
