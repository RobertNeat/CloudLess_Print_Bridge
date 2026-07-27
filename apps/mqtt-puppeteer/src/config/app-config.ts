import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  stateTemplatePath?: string;
}

export function loadAppConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  loadEnvFile(environment);
  const serial = value(environment.PRINTER_SN);

  return {
    mqtt: {
      host: value(environment.MQTT_HOST),
      port: integer(environment.MQTT_PORT, 8883, 1, 65_535),
      username: value(environment.MQTT_USERNAME) ?? 'bblp',
      password: value(environment.BAMBU_MQTT_PASSWORD),
      printerSerial: serial,
      reportTopic:
        value(environment.MQTT_REPORT_TOPIC) ??
        (serial ? `device/${serial}/report` : undefined),
      commandTopic:
        value(environment.MQTT_COMMAND_TOPIC) ??
        (serial ? `device/${serial}/request` : undefined),
      rejectUnauthorized: boolean(environment.MQTT_REJECT_UNAUTHORIZED, false),
      connectTimeoutMs: integer(environment.MQTT_CONNECT_TIMEOUT_MS, 10_000, 1),
      reconnectPeriodMs: integer(
        environment.MQTT_RECONNECT_PERIOD_MS,
        4_000,
        0,
      ),
      keepaliveSeconds: integer(environment.MQTT_KEEPALIVE_SECONDS, 60, 0),
    },
    commands: {
      catalogPath: value(environment.COMMAND_CATALOG_PATH),
      catalogMode:
        value(environment.COMMAND_CATALOG_MODE) === 'extend'
          ? 'extend'
          : 'replace',
    },
    filaments: {
      catalogPath: value(environment.FILAMENT_CATALOG_PATH),
      catalogMode:
        value(environment.FILAMENT_CATALOG_MODE) === 'extend'
          ? 'extend'
          : 'replace',
    },
    filamentSystem: {
      amsUnitCount: integer(environment.AMS_UNIT_COUNT, 1, 0, 64),
      slotsPerUnit: integer(environment.AMS_SLOTS_PER_UNIT, 4, 1, 256),
      externalSpool: boolean(environment.EXTERNAL_SPOOL_ENABLED, true),
    },
    stateTemplatePath: value(environment.PRINTER_STATE_TEMPLATE_PATH),
  };
}

function loadEnvFile(environment: NodeJS.ProcessEnv): void {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (environment[key] !== undefined) continue;
    environment[key] = unquote(trimmed.slice(separator + 1).trim());
  }
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
