import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthConfig } from '../auth/auth.types';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  mqtt: {
    host?: string;
    port: number;
    username: string;
    password?: string;
    printerSerial?: string;
    reportTopic?: string;
    commandTopic?: string;
    rejectUnauthorized: boolean;
    connectTimeoutMs: number;
    reconnectPeriodMs: number;
    keepaliveSeconds: number;
  };
  commands: {
    catalogPath?: string;
    catalogMode: 'replace' | 'extend';
  };
  filaments: {
    catalogPath?: string;
    catalogMode: 'replace' | 'extend';
  };
  filamentSystem: {
    amsUnitCount: number;
    slotsPerUnit: number;
    externalSpool: boolean;
  };
  operations: {
    timeoutMs: number;
  };
  http: {
    host: string;
    port: number;
    corsOrigins: string[] | true;
  };
  telemetry: {
    historyCapacity: number;
  };
  auth: AuthConfig;
  stateTemplatePath?: string;
  ftps: {
    host: string;
    port: number;
    username: string;
    password: string;
    tlsMode: FtpsTlsMode;
    certificateFingerprint256: string;
    timeoutMs: number;
    maximumConcurrentSessions: number;
  };
  printJobThumbnail: {
    /** Remote directory the active job's .gcode is matched against, e.g. "/cache/". */
    gcodeDirectory: string;
    /** Remote directory of per-thumbnail-identifier .md5 index files, e.g. "/image/md5/". */
    md5IndexDirectory: string;
    /** Remote directory the resolved "<identifier>.png" thumbnail is read from, e.g. "/image/". */
    imageDirectory: string;
    /** How often the .md5 index directory is re-listed for newly appeared identifiers. */
    indexRefreshIntervalMs: number;
  };
}

export type FtpsTlsMode = 'implicit' | 'explicit';

export function loadAppConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  loadWorkspaceEnv(environment);
  const serial = envValue(environment, 'MQTT_PUPPETEER_PRINTER_SN');

  return {
    http: {
      host: envValue(environment, 'MQTT_PUPPETEER_HOST') ?? '0.0.0.0',
      port: integer(
        envValue(environment, 'MQTT_PUPPETEER_PORT'),
        10320,
        0,
        65_535,
      ),
      corsOrigins: parseCorsOrigins(
        envValue(environment, 'MQTT_PUPPETEER_CORS_ORIGINS'),
      ),
    },
    mqtt: {
      host: envValue(environment, 'MQTT_PUPPETEER_MQTT_HOST'),
      port: integer(
        envValue(environment, 'MQTT_PUPPETEER_MQTT_PORT'),
        8883,
        1,
        65_535,
      ),
      username: envValue(environment, 'MQTT_PUPPETEER_MQTT_USERNAME') ?? 'bblp',
      password: envValue(environment, 'MQTT_PUPPETEER_MQTT_PASSWORD'),
      printerSerial: serial,
      reportTopic:
        envValue(environment, 'MQTT_PUPPETEER_MQTT_REPORT_TOPIC') ??
        (serial ? `device/${serial}/report` : undefined),
      commandTopic:
        envValue(environment, 'MQTT_PUPPETEER_MQTT_COMMAND_TOPIC') ??
        (serial ? `device/${serial}/request` : undefined),
      rejectUnauthorized: boolean(
        envValue(environment, 'MQTT_PUPPETEER_MQTT_REJECT_UNAUTHORIZED'),
        false,
      ),
      connectTimeoutMs: integer(
        envValue(environment, 'MQTT_PUPPETEER_MQTT_CONNECT_TIMEOUT_MS'),
        10_000,
        1,
      ),
      reconnectPeriodMs: integer(
        envValue(environment, 'MQTT_PUPPETEER_MQTT_RECONNECT_PERIOD_MS'),
        4_000,
        0,
      ),
      keepaliveSeconds: integer(
        envValue(environment, 'MQTT_PUPPETEER_MQTT_KEEPALIVE_SECONDS'),
        60,
        0,
      ),
    },
    commands: {
      catalogPath: envValue(environment, 'MQTT_PUPPETEER_COMMAND_CATALOG_PATH'),
      catalogMode:
        envValue(environment, 'MQTT_PUPPETEER_COMMAND_CATALOG_MODE') ===
        'extend'
          ? 'extend'
          : 'replace',
    },
    filaments: {
      catalogPath: envValue(
        environment,
        'MQTT_PUPPETEER_FILAMENT_CATALOG_PATH',
      ),
      catalogMode:
        envValue(environment, 'MQTT_PUPPETEER_FILAMENT_CATALOG_MODE') ===
        'extend'
          ? 'extend'
          : 'replace',
    },
    filamentSystem: {
      amsUnitCount: integer(
        envValue(environment, 'MQTT_PUPPETEER_AMS_UNIT_COUNT'),
        1,
        0,
        64,
      ),
      slotsPerUnit: integer(
        envValue(environment, 'MQTT_PUPPETEER_AMS_SLOTS_PER_UNIT'),
        4,
        1,
        256,
      ),
      externalSpool: boolean(
        envValue(environment, 'MQTT_PUPPETEER_EXTERNAL_SPOOL_ENABLED'),
        true,
      ),
    },
    operations: {
      timeoutMs: integer(
        envValue(environment, 'MQTT_PUPPETEER_OPERATION_TIMEOUT_MS'),
        30_000,
        100,
        600_000,
      ),
    },
    telemetry: {
      historyCapacity: integer(
        envValue(environment, 'MQTT_PUPPETEER_TELEMETRY_HISTORY_CAPACITY'),
        720,
        1,
        100_000,
      ),
    },
    auth: loadAuthConfig(environment),
    stateTemplatePath: envValue(
      environment,
      'MQTT_PUPPETEER_PRINTER_STATE_TEMPLATE_PATH',
    ),
    ftps: loadFtpsConfig(environment),
    printJobThumbnail: {
      // Absolute from the FTP session root — see PrintJobThumbnailService's
      // doc comment for why a "./"-relative path does not work here.
      gcodeDirectory:
        envValue(environment, 'MQTT_PUPPETEER_FTP_GCODE_DIR') ?? '/cache/',
      md5IndexDirectory:
        envValue(environment, 'MQTT_PUPPETEER_FTP_THUMBNAIL_MD5_DIR') ??
        '/image/md5/',
      imageDirectory:
        envValue(environment, 'MQTT_PUPPETEER_FTP_THUMBNAIL_DIR') ?? '/image/',
      indexRefreshIntervalMs: integer(
        envValue(environment, 'MQTT_PUPPETEER_FTP_THUMBNAIL_INDEX_REFRESH_MS'),
        30_000,
        1_000,
      ),
    },
  };
}

function loadFtpsConfig(environment: NodeJS.ProcessEnv): AppConfig['ftps'] {
  const tlsMode = envValue(environment, 'BAMBULAB_A1_FTP_MODE') ?? 'implicit';
  if (tlsMode !== 'implicit' && tlsMode !== 'explicit') {
    throw new Error('BAMBULAB_A1_FTP_MODE must be implicit or explicit');
  }

  const certificateFingerprint256 = requiredValue(
    environment,
    'BAMBULAB_A1_FTP_TLS_FINGERPRINT256',
  )
    .replaceAll(':', '')
    .toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(certificateFingerprint256)) {
    throw new Error(
      'BAMBULAB_A1_FTP_TLS_FINGERPRINT256 must contain 64 hexadecimal characters',
    );
  }

  return {
    host: requiredValue(environment, 'BAMBULAB_A1_IP'),
    port: integer(
      envValue(environment, 'BAMBULAB_A1_FTP_PORT'),
      990,
      1,
      65_535,
    ),
    username: requiredValue(environment, 'BAMBULAB_A1_FTP_USERNAME'),
    password: requiredValue(environment, 'BAMBULAB_A1_ACCESS_CODE'),
    tlsMode,
    certificateFingerprint256,
    timeoutMs: integer(
      envValue(environment, 'MQTT_PUPPETEER_FTP_TIMEOUT_MS'),
      10_000,
      1,
    ),
    maximumConcurrentSessions: 1,
  };
}

function requiredValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = envValue(environment, name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

function unquote(valueToUnquote: string): string {
  if (
    (valueToUnquote.startsWith('"') && valueToUnquote.endsWith('"')) ||
    (valueToUnquote.startsWith("'") && valueToUnquote.endsWith("'"))
  ) {
    return valueToUnquote.slice(1, -1);
  }
  return valueToUnquote;
}

function value(input: string | undefined): string | undefined {
  return input?.trim() || undefined;
}

function envValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  return value(environment[name]);
}

function loadAuthConfig(environment: NodeJS.ProcessEnv): AuthConfig {
  const mode = envValue(environment, 'CLOUDLESS_AUTH_MODE') ?? 'disabled';
  if (mode !== 'disabled' && mode !== 'optional' && mode !== 'required') {
    throw new Error(
      'CLOUDLESS_AUTH_MODE must be disabled, optional, or required',
    );
  }
  const tokenIssuerOrder = (
    envValue(environment, 'CLOUDLESS_AUTH_SERVICE_ORDER') ??
    'mqtt-puppeteer,ftps-remote-manager,video-service-hub'
  )
    .split(',')
    .map((service) => service.trim())
    .filter(Boolean);

  return {
    mode,
    serviceName: 'mqtt-puppeteer',
    sharedSecret: envValue(environment, 'CLOUDLESS_AUTH_SHARED_SECRET'),
    tokenIssuerOrder,
    tokenTtlSeconds: integer(
      envValue(environment, 'CLOUDLESS_AUTH_TOKEN_TTL_SECONDS'),
      86_400,
      60,
    ),
  };
}

function integer(
  input: string | undefined,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number(input ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid integer configuration value: ${input}`);
  }
  return parsed;
}

function boolean(input: string | undefined, fallback: boolean): boolean {
  if (input === undefined) return fallback;
  if (input === 'true') return true;
  if (input === 'false') return false;
  throw new Error(`Invalid boolean configuration value: ${input}`);
}

/**
 * Comma-separated list of allowed dashboard origins, e.g.
 * "http://localhost:4200,https://dashboard.example.com". The literal value
 * "*" opts into reflecting any origin (development convenience only).
 * Defaults to the octo-management-dashboard's local dev origin so the
 * dashboard can reach this service out of the box.
 */
function parseCorsOrigins(input: string | undefined): string[] | true {
  const value = input ?? 'http://localhost:4200';
  if (value === '*') return true;
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
