import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

const STREAM_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;

type StreamTokenRecord = {
  token: string;
  userId: string;
  cameraId: string;
  expiresAt: number;
  activeViewers: number;
};

@Injectable()
export class StreamTokenService {
  private readonly byToken = new Map<string, StreamTokenRecord>();
  private readonly byUserAndCamera = new Map<string, string>();

  issue(
    userId: string,
    cameraId: string,
  ): { token: string; expiresIn: number } {
    const key = `${userId}:${cameraId}`;
    const previousToken = this.byUserAndCamera.get(key);
    if (previousToken) {
      this.byToken.delete(previousToken);
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + STREAM_TOKEN_TTL_MS;
    this.byToken.set(token, {
      token,
      userId,
      cameraId,
      expiresAt,
      activeViewers: 0,
    });
    this.byUserAndCamera.set(key, token);
    return { token, expiresIn: Math.floor(STREAM_TOKEN_TTL_MS / 1000) };
  }

  /** Verifies the token once per new viewer connection and marks it in use. */
  acquire(token: string, cameraId: string): StreamTokenRecord {
    const record = this.byToken.get(token);
    if (!record || record.cameraId !== cameraId) {
      throw new UnauthorizedException('Invalid or unknown stream token.');
    }
    if (record.expiresAt <= Date.now()) {
      this.byToken.delete(token);
      throw new UnauthorizedException('Stream token has expired.');
    }
    record.activeViewers += 1;
    return record;
  }

  /** Called when a viewer connection closes; does not invalidate the token itself. */
  releaseViewer(token: string): void {
    const record = this.byToken.get(token);
    if (!record) return;
    record.activeViewers = Math.max(0, record.activeViewers - 1);
  }
}
