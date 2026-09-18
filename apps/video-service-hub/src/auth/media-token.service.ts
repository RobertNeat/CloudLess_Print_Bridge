import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

const MEDIA_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;

export type MediaFileKind =
  | 'recording'
  | 'recording-mp4'
  | 'capture'
  | 'capture-mp4'
  | 'audio'
  | 'live-recording';

export type MediaFileRef = {
  kind: MediaFileKind;
  cameraId: string;
  requestId: string;
  fileName?: string;
};

type MediaTokenRecord = MediaFileRef & {
  expiresAt: number;
};

/**
 * Grants access to one specific recorded media file for a plain <img>/<audio
 * src>, which cannot carry an Authorization header. Unlike StreamTokenService
 * (one live token per user+camera, replacing the previous one), many media
 * files can be open in separate preview popups at once, so tokens are simply
 * issued and left to expire naturally rather than evicted on reissue.
 */
@Injectable()
export class MediaTokenService {
  private readonly byToken = new Map<string, MediaTokenRecord>();

  issue(fileRef: MediaFileRef): { token: string; expiresIn: number } {
    const token = randomBytes(32).toString('base64url');
    this.byToken.set(token, {
      ...fileRef,
      expiresAt: Date.now() + MEDIA_TOKEN_TTL_MS,
    });
    return { token, expiresIn: Math.floor(MEDIA_TOKEN_TTL_MS / 1000) };
  }

  /** Verifies the token once when the file starts streaming; never re-checked mid-stream. */
  acquire(token: string, expected: MediaFileRef): MediaTokenRecord {
    const record = this.byToken.get(token);
    if (
      !record ||
      record.kind !== expected.kind ||
      record.cameraId !== expected.cameraId ||
      record.requestId !== expected.requestId ||
      (expected.fileName !== undefined && record.fileName !== expected.fileName)
    ) {
      throw new UnauthorizedException('Invalid or unknown media token.');
    }
    if (record.expiresAt <= Date.now()) {
      this.byToken.delete(token);
      throw new UnauthorizedException('Media token has expired.');
    }
    return record;
  }
}
