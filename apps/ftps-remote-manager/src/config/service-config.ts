import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

export type FtpsTlsMode = 'implicit' | 'explicit';

export interface ServiceConfig {
  http: {
    host: string;
    port: number;
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
}

export function loadServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServiceConfig {
  loadWorkspaceEnv(environment);

  const tlsMode = optionalValue(environment.FTP_TLS_MODE) ?? 'implicit';
  if (tlsMode !== 'implicit' && tlsMode !== 'explicit') {
    throw new Error('FTP_TLS_MODE must be implicit or explicit');
  }

  const certificateFingerprint256 = requiredValue(
    environment,
    'FTP_TLS_FINGERPRINT256',
  )
    .replaceAll(':', '')
    .toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(certificateFingerprint256)) {
    throw new Error(
      'FTP_TLS_FINGERPRINT256 must contain 64 hexadecimal characters',
    );
  }

  return {
    http: {
      host: optionalValue(environment.HOST) ?? '127.0.0.1',
      port: integer(environment, 'PORT', 3000, 0, 65_535),
    },
    ftps: {
      host: requiredValue(environment, 'FTP_HOST'),
      port: integer(environment, 'FTP_PORT', 990, 1, 65_535),
      username: requiredValue(environment, 'FTP_USER'),
      password: requiredValue(environment, 'FTP_PASSWORD'),
      tlsMode,
      certificateFingerprint256,
      timeoutMs: integer(environment, 'FTP_TIMEOUT_MS', 10_000, 1),
      maximumConcurrentSessions: integer(
        environment,
        'FTP_MAX_CONCURRENT_SESSIONS',
        1,
        1,
        16,
      ),
    },
    upload: {
      maximumBytes: integer(
        environment,
        'FTP_UPLOAD_MAX_BYTES',
        250 * 1024 * 1024,
        1,
      ),
    },
  };
}

function loadWorkspaceEnv(environment: NodeJS.ProcessEnv): void {
  if (environment !== process.env) return;
  const path = resolve(process.cwd(), '.env');
  if (existsSync(path)) loadEnvFile(path);
}

function requiredValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = optionalValue(environment[name]);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalValue(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function integer(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}
