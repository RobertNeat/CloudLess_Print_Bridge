import { resolve } from 'node:path';

export type ServiceConfig = {
  http: {
    host: string;
    port: number;
  };
  storage: {
    root: string;
    captureMaxBytes: number;
    recordingPartMaxBytes: number;
    audioMaxBytes: number;
    liveMaxBytes: number;
    liveViewerBufferBytes: number;
  };
  cameraCommandTimeoutMs: number;
  mqtt: {
    port: number;
    externalUrl?: string;
    username?: string;
    password?: string;
    connectTimeoutMs: number;
    reconnectPeriodMs: number;
    onlineTtlMs: number;
  };
};

export function loadServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServiceConfig {
  return {
    http: {
      host: environment.HOST?.trim() || '0.0.0.0',
      port: readInteger(environment, 'PORT', 3000, 0, 65_535),
    },
    storage: {
      root: resolve(
        environment.STORAGE_PATH?.trim() || resolve(process.cwd(), 'storage'),
      ),
      captureMaxBytes: readInteger(
        environment,
        'CAPTURE_MAX_BYTES',
        20 * 1024 * 1024,
        1,
      ),
      recordingPartMaxBytes: readInteger(
        environment,
        'RECORDING_PART_MAX_BYTES',
        16 * 1024 * 1024,
        1,
      ),
      audioMaxBytes: readInteger(
        environment,
        'AUDIO_MAX_BYTES',
        10 * 1024 * 1024,
        1,
      ),
      liveMaxBytes: readInteger(
        environment,
        'LIVE_MAX_BYTES',
        1024 * 1024 * 1024,
        1,
      ),
      liveViewerBufferBytes: readInteger(
        environment,
        'LIVE_VIEWER_BUFFER_BYTES',
        2 * 1024 * 1024,
        64 * 1024,
      ),
    },
    cameraCommandTimeoutMs: readInteger(
      environment,
      'CAMERA_COMMAND_TIMEOUT_MS',
      10_000,
      1,
    ),
    mqtt: {
      port: readInteger(environment, 'MQTT_PORT', 1883, 0, 65_535),
      externalUrl: environment.MQTT_URL?.trim() || undefined,
      username: environment.MQTT_USERNAME,
      password: environment.MQTT_PASSWORD,
      connectTimeoutMs: readInteger(
        environment,
        'MQTT_CONNECT_TIMEOUT_MS',
        10_000,
        1,
      ),
      reconnectPeriodMs: readInteger(
        environment,
        'MQTT_RECONNECT_PERIOD_MS',
        1_000,
        0,
      ),
      onlineTtlMs: readInteger(
        environment,
        'MQTT_CAMERA_ONLINE_TTL_MS',
        60_000,
        0,
      ),
    },
  };
}

function readInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = Number(environment[name] ?? defaultValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}
