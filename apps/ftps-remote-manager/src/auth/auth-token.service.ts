import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type {
  AccessTokenClaims,
  AuthConfig,
  AuthenticatedUser,
} from './auth.types';

@Injectable()
export class AuthTokenService {
  createAccessToken(config: AuthConfig, user: AuthenticatedUser): string {
    const secret = requireSharedSecret(config);
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      ...user,
      iss: config.serviceName,
      sub: user.userId,
      iat: now,
      exp: now + config.tokenTtlSeconds,
    };
    return signJwt({ alg: 'HS256', typ: 'JWT' }, claims, secret);
  }

  verifyAccessToken(config: AuthConfig, token: string): AccessTokenClaims {
    const secret = requireSharedSecret(config);
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException('Malformed bearer token.');
    }

    const expectedSignature = hmac(
      `${encodedHeader}.${encodedPayload}`,
      secret,
    );
    if (!constantTimeEquals(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid bearer token signature.');
    }

    const claims = JSON.parse(
      fromBase64Url(encodedPayload).toString('utf8'),
    ) as AccessTokenClaims;
    const now = Math.floor(Date.now() / 1000);
    if (!claims.sub || !claims.iss || !claims.exp || claims.exp <= now) {
      throw new UnauthorizedException('Expired or invalid bearer token.');
    }
    if (!config.tokenIssuerOrder.includes(claims.iss)) {
      throw new UnauthorizedException('Bearer token issuer is not trusted.');
    }
    return claims;
  }
}

function requireSharedSecret(config: AuthConfig): string {
  if (config.mode !== 'disabled' && !config.sharedSecret) {
    throw new UnauthorizedException(
      'Authentication shared secret is not configured.',
    );
  }
  return config.sharedSecret ?? 'disabled-development-secret';
}

function signJwt(header: object, payload: object, secret: string): string {
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = hmac(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function hmac(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
