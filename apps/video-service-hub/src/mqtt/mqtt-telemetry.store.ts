import { Inject, Injectable } from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import type { ObservedMqttMessage } from './mqtt.ports';

export type TelemetryRecord = {
  cameraId: string;
  channel: string;
  topic: string;
  payload: unknown;
  rawPayload: string;
  receivedAt: string;
  retain: boolean;
  qos: number;
};

export type CameraMetadata = {
  cameraId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastHeartbeatAt: string | null;
  lastChannel: string;
  messageCount: number;
  online: boolean;
};

const channels = new Set([
  'heartbeat',
  'led',
  'microphone',
  'status',
  'network',
  'state',
  'upload',
]);
const cameraIdPattern = /^[A-Za-z0-9._-]{1,64}$/;

@Injectable()
export class MqttTelemetryStore {
  private readonly telemetry = new Map<string, TelemetryRecord>();
  private readonly cameras = new Map<string, Omit<CameraMetadata, 'online'>>();

  constructor(@Inject(SERVICE_CONFIG) private readonly config: ServiceConfig) {}

  record(message: ObservedMqttMessage, now = new Date()): void {
    const match = /^cameras\/([^/]+)\/([^/]+)$/.exec(message.topic);
    if (!match || !channels.has(match[2])) {
      return;
    }
    const cameraId = match[1];
    const channel = match[2];
    if (
      !cameraIdPattern.test(cameraId) ||
      cameraId === '.' ||
      cameraId === '..'
    ) {
      return;
    }
    const receivedAt = now.toISOString();
    const rawPayload = message.payload.toString('utf8');
    let payload: unknown = rawPayload;
    try {
      payload = JSON.parse(rawPayload) as unknown;
    } catch {
      // Keeping malformed payloads is useful for diagnostics.
    }
    const record: TelemetryRecord = {
      cameraId,
      channel,
      topic: message.topic,
      payload,
      rawPayload,
      receivedAt,
      retain: message.retain,
      qos: message.qos,
    };
    this.telemetry.set(`${cameraId}:${channel}`, record);
    const previous = this.cameras.get(cameraId);
    this.cameras.set(cameraId, {
      cameraId,
      firstSeenAt: previous?.firstSeenAt ?? receivedAt,
      lastSeenAt: receivedAt,
      lastHeartbeatAt:
        channel === 'heartbeat'
          ? receivedAt
          : (previous?.lastHeartbeatAt ?? null),
      lastChannel: channel,
      messageCount: (previous?.messageCount ?? 0) + 1,
    });
  }

  getCameras(now = new Date()): CameraMetadata[] {
    return [...this.cameras.values()].map((metadata) => ({
      ...metadata,
      online:
        now.getTime() - Date.parse(metadata.lastSeenAt) <=
        this.config.mqtt.onlineTtlMs,
    }));
  }

  getCameraTelemetry(cameraId: string): TelemetryRecord[] {
    return [...this.telemetry.values()].filter(
      (record) => record.cameraId === cameraId,
    );
  }

  getCounts(): { cameraCount: number; telemetryCount: number } {
    return {
      cameraCount: this.cameras.size,
      telemetryCount: this.telemetry.size,
    };
  }
}
