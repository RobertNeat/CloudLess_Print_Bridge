import { BadRequestException } from '@nestjs/common';

const identifierPattern = /^[A-Za-z0-9._-]{1,64}$/;
const supportedResolutions = new Set(['QVGA', 'VGA', 'SVGA', 'XGA', 'UXGA']);

export function assertIdentifier(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !identifierPattern.test(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return value;
}

export function assertResolution(value: unknown): string {
  if (typeof value !== 'string' || !supportedResolutions.has(value)) {
    throw new BadRequestException(
      'resolution must be one of QVGA, VGA, SVGA, XGA, or UXGA',
    );
  }
  return value;
}

export function assertInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (
    typeof parsed !== 'number' ||
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new BadRequestException(
      `${field} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

export function assertFiniteNumber(
  value: unknown,
  field: string,
  minimum: number,
): number {
  const parsed =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (
    typeof parsed !== 'number' ||
    !Number.isFinite(parsed) ||
    parsed < minimum
  ) {
    throw new BadRequestException(`${field} must be at least ${minimum}`);
  }
  return parsed;
}

export function assertMediaType(
  contentType: string | undefined,
  expected: string,
): string {
  const actual = contentType?.split(';', 1)[0].trim().toLowerCase();
  if (actual !== expected) {
    throw new BadRequestException(`Content-Type must be ${expected}`);
  }
  return contentType as string;
}

export function requireHeader(value: string | undefined, name: string): string {
  if (!value) {
    throw new BadRequestException(`${name} header is required`);
  }
  return value;
}

const safeFileNamePattern = /^[A-Za-z0-9._-]{1,128}$/;

export function assertSafeFileName(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !safeFileNamePattern.test(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return value;
}

export function assertCameraBaseUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('baseUrl is required');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('baseUrl is invalid');
  }
  if (
    url.protocol !== 'http:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new BadRequestException('baseUrl must be an HTTP origin');
  }
  return url.origin;
}
