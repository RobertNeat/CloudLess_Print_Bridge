import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthConfig } from '../auth/auth.types';

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
  auth: AuthConfig;
};

export function loadServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServiceConfig {
  loadWorkspaceEnv(environment);

  return {
    http: {
      host: envValue(environment, 'VIDEO_SERVICE_HUB_HOST') || '0.0.0.0',
      port: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_PORT'),
        'VIDEO_SERVICE_HUB_PORT',
        10222,
        0,
        65_535,
      ),
    },
    storage: {
      root: resolve(
        envValue(environment, 'VIDEO_SERVICE_HUB_STORAGE_PATH') ||
          resolve(process.cwd(), 'storage'),
      ),
      captureMaxBytes: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_CAPTURE_MAX_BYTES'),
        'VIDEO_SERVICE_HUB_CAPTURE_MAX_BYTES',
        20 * 1024 * 1024,
        1,
      ),
      recordingPartMaxBytes: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_RECORDING_PART_MAX_BYTES'),
        'VIDEO_SERVICE_HUB_RECORDING_PART_MAX_BYTES',
        16 * 1024 * 1024,
        1,
      ),
      audioMaxBytes: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_AUDIO_MAX_BYTES'),
        'VIDEO_SERVICE_HUB_AUDIO_MAX_BYTES',
        10 * 1024 * 1024,
        1,
      ),
      liveMaxBytes: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_LIVE_MAX_BYTES'),
        'VIDEO_SERVICE_HUB_LIVE_MAX_BYTES',
        1024 * 1024 * 1024,
        1,
      ),
      liveViewerBufferBytes: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_LIVE_VIEWER_BUFFER_BYTES'),
        'VIDEO_SERVICE_HUB_LIVE_VIEWER_BUFFER_BYTES',
        2 * 1024 * 1024,
        64 * 1024,
      ),
    },
    cameraCommandTimeoutMs: readIntegerValue(
      envValue(environment, 'VIDEO_SERVICE_HUB_CAMERA_COMMAND_TIMEOUT_MS'),
      'VIDEO_SERVICE_HUB_CAMERA_COMMAND_TIMEOUT_MS',
      10_000,
      1,
    ),
    mqtt: {
      port: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_MQTT_PORT'),
        'VIDEO_SERVICE_HUB_MQTT_PORT',
        1883,
        0,
        65_535,
      ),
      externalUrl: envValue(environment, 'VIDEO_SERVICE_HUB_MQTT_URL'),
      username: envValue(environment, 'VIDEO_SERVICE_HUB_MQTT_USERNAME'),
      password: envValue(environment, 'VIDEO_SERVICE_HUB_MQTT_PASSWORD'),
      connectTimeoutMs: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_MQTT_CONNECT_TIMEOUT_MS'),
        'VIDEO_SERVICE_HUB_MQTT_CONNECT_TIMEOUT_MS',
        10_000,
        1,
      ),
      reconnectPeriodMs: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_MQTT_RECONNECT_PERIOD_MS'),
        'VIDEO_SERVICE_HUB_MQTT_RECONNECT_PERIOD_MS',
        1_000,
        0,
      ),
      onlineTtlMs: readIntegerValue(
        envValue(environment, 'VIDEO_SERVICE_HUB_MQTT_CAMERA_ONLINE_TTL_MS'),
        'VIDEO_SERVICE_HUB_MQTT_CAMERA_ONLINE_TTL_MS',
        60_000,
        0,
      ),
    },
    auth: loadAuthConfig(environment),
  };
}

function loadWorkspaceEnv(environment: NodeJS.ProcessEnv): void {
  if (environment !== process.env) return;
  let directory = process.cwd();
  while (true) {
    if (existsSync(resolve(directory, 'pnpm-workspace.yaml'))) {
      const path = resolve(directory, '.env');
      if (!existsSync(path)) return;
      const fileValues: Record<string, string> = {};
      for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator < 1) continue;
        fileValues[trimmed.slice(0, separator).trim()] = unquote(
          trimmed.slice(separator + 1).trim(),
        );
      }
      for (const [key, rawValue] of Object.entries(fileValues)) {
        if (environment[key] !== undefined) continue;
        environment[key] = resolveEnvReferences(rawValue, {
          ...fileValues,
          ...environment,
        });
      }
      return;
    }
    const parent = resolve(directory, '..');
    if (parent === directory) return;
    directory = parent;
  }
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function resolveEnvReferences(
  input: string,
  values: Record<string, string | undefined>,
  resolving = new Set<string>(),
): string {
  return input.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (match, name: string) => {
      const value = values[name];
      if (value === undefined) return match;
      if (resolving.has(name)) {
        throw new Error(`Circular environment variable reference: ${name}`);
      }
      return resolveEnvReferences(value, values, new Set(resolving).add(name));
    },
  );
}

function envValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  return environment[name]?.trim() || undefined;
}

function readIntegerValue(
  input: string | undefined,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = Number(input ?? defaultValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function loadAuthConfig(environment: NodeJS.ProcessEnv): AuthConfig {
  const mode = envValue(environment, 'CLOUDLESS_AUTH_MODE') ?? 'disabled';
  if (mode !== 'disabled' && mode !== 'optional' && mode !== 'required') {
    throw new Error(
      'CLOUDLESS_AUTH_MODE must be disabled, optional, or required',
    );
  }

  return {
    mode,
    serviceName: 'video-service-hub',
    sharedSecret: envValue(environment, 'CLOUDLESS_AUTH_SHARED_SECRET'),
    tokenIssuerOrder: (
      envValue(environment, 'CLOUDLESS_AUTH_SERVICE_ORDER') ??
      'mqtt-puppeteer,ftps-remote-manager,video-service-hub'
    )
      .split(',')
      .map((service) => service.trim())
      .filter(Boolean),
    tokenTtlSeconds: readIntegerValue(
      envValue(environment, 'CLOUDLESS_AUTH_TOKEN_TTL_SECONDS'),
      'CLOUDLESS_AUTH_TOKEN_TTL_SECONDS',
      86_400,
      60,
    ),
  };
}
