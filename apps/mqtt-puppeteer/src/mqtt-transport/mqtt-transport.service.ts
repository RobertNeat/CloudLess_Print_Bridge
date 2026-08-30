import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { connect, type IClientOptions, type MqttClient } from 'mqtt';
import { isJsonObject, type JsonObject } from '../common/json';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import {
  BridgeEventsService,
  type MqttConnectionStatus,
  type MqttReport,
} from '../events/bridge-events.service';
import { applyOperationSequence } from '../operations/operation-payload';
import { OperationTrackerService } from '../operations/operation-tracker.service';

export interface PublishResult {
  published: true;
  operationId: string;
  topic: string;
  qos: 0;
  payload: JsonObject;
}

export interface PublishContext {
  operationId: string;
  commandId?: string;
}

@Injectable()
export class MqttTransportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttTransportService.name);
  private client: MqttClient | null = null;
  private connected = false;
  private lastError: string | null = null;
  private latestReport: MqttReport | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly events: BridgeEventsService,
    private readonly operations: OperationTrackerService,
  ) {}

  onModuleInit(): void {
    if (!this.isConfigured()) {
      this.lastError =
        'MQTT is disabled: configure MQTT_PUPPETEER_MQTT_HOST, MQTT_PUPPETEER_MQTT_PASSWORD, MQTT_PUPPETEER_PRINTER_SN or explicit topics';
      this.logger.warn(this.lastError);
      this.emitStatus();
      return;
    }
    this.connect();
  }

  onModuleDestroy(): void {
    this.client?.end(true);
  }

  getStatus(): MqttConnectionStatus {
    return {
      connected: this.connected,
      configured: this.isConfigured(),
      lastError: this.lastError,
      subscribedTopic: this.config.mqtt.reportTopic ?? null,
      commandTopic: this.config.mqtt.commandTopic ?? null,
    };
  }

  getLatestReport(): MqttReport | null {
    return this.latestReport ? structuredClone(this.latestReport) : null;
  }

  getPublicConfiguration() {
    const mqtt = this.config.mqtt;
    return {
      host: mqtt.host,
      port: mqtt.port,
      username: mqtt.username,
      printerSerial: mqtt.printerSerial,
      reportTopic: mqtt.reportTopic,
      commandTopic: mqtt.commandTopic,
      rejectUnauthorized: mqtt.rejectUnauthorized,
      connectTimeoutMs: mqtt.connectTimeoutMs,
      reconnectPeriodMs: mqtt.reconnectPeriodMs,
      keepaliveSeconds: mqtt.keepaliveSeconds,
      passwordConfigured: Boolean(mqtt.password),
      operationTimeoutMs: this.config.operations.timeoutMs,
    };
  }

  async publish(
    payload: unknown,
    context: PublishContext,
  ): Promise<PublishResult> {
    this.operations.begin({
      operationId: context.operationId,
      sequenceId: context.operationId,
      commandId: context.commandId,
    });
    if (!isJsonObject(payload)) {
      const message = 'MQTT command payload must be a JSON object';
      this.emitPublicationFailure(context, message);
      this.operations.reject(context.operationId, message);
      throw new BadRequestException(message);
    }
    const operationPayload = applyOperationSequence(
      payload,
      context.operationId,
    );
    if (!this.client || !this.connected || !this.config.mqtt.commandTopic) {
      const message = 'MQTT client is not connected';
      this.emitPublicationFailure(context, message, operationPayload);
      this.operations.reject(context.operationId, message);
      throw new ServiceUnavailableException(message);
    }

    const topic = this.config.mqtt.commandTopic;
    await new Promise<void>((resolve, reject) => {
      this.client?.publish(
        topic,
        JSON.stringify(operationPayload),
        { qos: 0 },
        (error?: Error) => {
          if (error) reject(error);
          else resolve();
        },
      );
    }).catch((error: unknown) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emitStatus();
      this.emitPublicationFailure(
        context,
        this.lastError,
        operationPayload,
        topic,
      );
      this.operations.reject(context.operationId, this.lastError);
      throw new ServiceUnavailableException(
        `MQTT publish failed: ${this.lastError}`,
      );
    });

    const result: PublishResult = {
      published: true,
      operationId: context.operationId,
      topic,
      qos: 0,
      payload: operationPayload,
    };
    this.events.mqttPublications$.next({
      status: 'published',
      operationId: context.operationId,
      commandId: context.commandId,
      occurredAt: new Date().toISOString(),
      topic,
      qos: 0,
      payload: operationPayload,
    });
    return result;
  }

  private isConfigured(): boolean {
    const mqtt = this.config.mqtt;
    return Boolean(
      mqtt.host && mqtt.password && mqtt.reportTopic && mqtt.commandTopic,
    );
  }

  private connect(): void {
    const mqtt = this.config.mqtt;
    const options: IClientOptions = {
      username: mqtt.username,
      password: mqtt.password,
      clientId: `cloudless_mqtt_puppeteer_${process.pid}`,
      protocolVersion: 4,
      clean: true,
      connectTimeout: mqtt.connectTimeoutMs,
      reconnectPeriod: mqtt.reconnectPeriodMs,
      keepalive: mqtt.keepaliveSeconds,
      rejectUnauthorized: mqtt.rejectUnauthorized,
    };

    this.client = connect(`mqtts://${mqtt.host}:${mqtt.port}`, options);
    this.client.on('connect', () => this.handleConnected());
    this.client.on('message', (topic, payload) =>
      this.handleMessage(topic, payload),
    );
    this.client.on('error', (error) => {
      this.lastError = error.message;
      this.logger.error(`MQTT error: ${error.message}`);
      this.events.emitMqttError(error);
      this.emitStatus();
    });
    this.client.on('close', () => {
      this.connected = false;
      this.emitStatus();
    });
    this.client.on('reconnect', () => {
      this.connected = false;
      this.emitStatus();
    });
  }

  private handleConnected(): void {
    this.connected = true;
    this.lastError = null;
    this.emitStatus();
    const topic = this.config.mqtt.reportTopic;
    if (!topic) return;

    this.client?.subscribe(topic, { qos: 0 }, (error: Error | null) => {
      if (error) {
        this.lastError = error.message;
        this.logger.error(`MQTT subscribe failed: ${error.message}`);
        this.events.emitMqttError(error);
      } else {
        this.logger.log(`Subscribed to MQTT topic: ${topic}`);
      }
      this.emitStatus();
    });
  }

  private handleMessage(topic: string, payload: Buffer): void {
    if (topic !== this.config.mqtt.reportTopic) return;
    const text = payload.toString('utf8');
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      const error = new Error('Received a non-JSON MQTT report');
      this.logger.warn(error.message);
      this.events.emitMqttError(error);
    }

    this.latestReport = {
      topic,
      receivedAt: new Date().toISOString(),
      payload: parsed,
    };
    this.events.mqttReports$.next(this.latestReport);
  }

  private emitStatus(): void {
    this.events.mqttStatus$.next(this.getStatus());
  }

  private emitPublicationFailure(
    context: PublishContext,
    error: string,
    payload?: JsonObject,
    topic: string | null = this.config.mqtt.commandTopic ?? null,
  ): void {
    this.events.mqttPublications$.next({
      status: 'failed',
      operationId: context.operationId,
      commandId: context.commandId,
      occurredAt: new Date().toISOString(),
      topic,
      qos: 0,
      payload,
      error,
    });
  }
}
