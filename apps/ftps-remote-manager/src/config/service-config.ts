import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthConfig } from '../auth/auth.types';

export type FtpsTlsMode = 'implicit' | 'explicit';

export interface ServiceConfig {
  http: {
    host: string;
    port: number;
    corsOrigins: string[] | true;
  };
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
  upload: {
    maximumBytes: number;
  };
  auth: AuthConfig;
}

export function loadServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServiceConfig {
  loadWorkspaceEnv(environment);

  const tlsMode =
    envValue(environment, 'FTPS_REMOTE_MANAGER_FTP_TLS_MODE') ?? 'implicit';
  if (tlsMode !== 'implicit' && tlsMode !== 'explicit') {
    throw new Error(
      'FTPS_REMOTE_MANAGER_FTP_TLS_MODE must be implicit or explicit',
    );
  }

  const certificateFingerprint256 = requiredValue(
    environment,
    'FTPS_REMOTE_MANAGER_FTP_TLS_FINGERPRINT256',
  )
    .replaceAll(':', '')
    .toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(certificateFingerprint256)) {
    throw new Error(
      'FTPS_REMOTE_MANAGER_FTP_TLS_FINGERPRINT256 must contain 64 hexadecimal characters',
    );
  }

  return {
    http: {
      host: envValue(environment, 'FTPS_REMOTE_MANAGER_HOST') ?? '127.0.0.1',
      port: integerValue(
        envValue(environment, 'FTPS_REMOTE_MANAGER_PORT'),
        'FTPS_REMOTE_MANAGER_PORT',
        10321,
        0,
        65_535,
      ),
      corsOrigins: parseCorsOrigins(
        envValue(environment, 'FTPS_REMOTE_MANAGER_CORS_ORIGINS'),
      ),
    },
    ftps: {
      host: requiredValue(environment, 'FTPS_REMOTE_MANAGER_FTP_HOST'),
      port: integerValue(
        envValue(environment, 'FTPS_REMOTE_MANAGER_FTP_PORT'),
        'FTPS_REMOTE_MANAGER_FTP_PORT',
        990,
        1,
        65_535,
      ),
      username: requiredValue(environment, 'FTPS_REMOTE_MANAGER_FTP_USER'),
      password: requiredValue(environment, 'FTPS_REMOTE_MANAGER_FTP_PASSWORD'),
      tlsMode,
      certificateFingerprint256,
      timeoutMs: integerValue(
        envValue(environment, 'FTPS_REMOTE_MANAGER_FTP_TIMEOUT_MS'),
        'FTPS_REMOTE_MANAGER_FTP_TIMEOUT_MS',
        10_000,
        1,
      ),
      maximumConcurrentSessions: integerValue(
        envValue(
          environment,
          'FTPS_REMOTE_MANAGER_FTP_MAX_CONCURRENT_SESSIONS',
        ),
        'FTPS_REMOTE_MANAGER_FTP_MAX_CONCURRENT_SESSIONS',
        1,
        1,
        16,
      ),
    },
    upload: {
      maximumBytes: integerValue(
        envValue(environment, 'FTPS_REMOTE_MANAGER_FTP_UPLOAD_MAX_BYTES'),
        'FTPS_REMOTE_MANAGER_FTP_UPLOAD_MAX_BYTES',
        250 * 1024 * 1024,
        1,
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

function requiredValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = envValue(environment, name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalValue(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function envValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  return optionalValue(environment[name]);
}

function parseCorsOrigins(input: string | undefined): string[] | true {
  const value = input ?? 'http://localhost:10300';
  if (value === '*') return true;
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function integerValue(
  input: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = Number(input ?? fallback);
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
    serviceName: 'ftps-remote-manager',
    sharedSecret: envValue(environment, 'CLOUDLESS_AUTH_SHARED_SECRET'),
    tokenIssuerOrder: (
      envValue(environment, 'CLOUDLESS_AUTH_SERVICE_ORDER') ??
      'mqtt-puppeteer,ftps-remote-manager,video-service-hub'
    )
      .split(',')
      .map((service) => service.trim())
      .filter(Boolean),
    tokenTtlSeconds: integerValue(
      envValue(environment, 'CLOUDLESS_AUTH_TOKEN_TTL_SECONDS'),
      'CLOUDLESS_AUTH_TOKEN_TTL_SECONDS',
      86_400,
      60,
    ),
  };
}
