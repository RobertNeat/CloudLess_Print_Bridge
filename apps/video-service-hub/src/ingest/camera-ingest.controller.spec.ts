import type { Request } from 'express';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { StreamTokenService } from '../auth/stream-token.service';
import { loadServiceConfig } from '../config/service-config';
import { MediaStorageService } from '../storage/media-storage.service';
import { ThumbnailService } from '../thumbnails/thumbnail.service';
import { CameraIngestController } from './camera-ingest.controller';

// Real, ffmpeg-decodable fixtures -- see thumbnail.service.spec.ts for why a
// hand-rolled SOI/EOI byte pair is not enough to exercise actual generation.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAUHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAGAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjgDf0sAAAAAB/9k=';
const TINY_WAV_BASE64 =
  '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';
const BOUNDARY = 'unitcams3-frame';

function requestFrom(content: Buffer): Request {
  const request = new PassThrough();
  request.end(content);
  return request as unknown as Request;
}

function multipartPart(frameCount: number): Buffer {
  const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
  const chunks: Buffer[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    chunks.push(
      Buffer.from(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\n\r\n`),
      jpeg,
      Buffer.from('\r\n'),
    );
  }
  return Buffer.concat(chunks);
}

describe('CameraIngestController (thumbnail generation on ingest)', () => {
  let storageRoot: string;
  let storage: MediaStorageService;
  let controller: CameraIngestController;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'video-service-hub-ingest-'));
    storage = new MediaStorageService(
      loadServiceConfig({
        VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
        VIDEO_SERVICE_HUB_MQTT_PORT: '0',
      }),
    );
    await storage.initialize();
    controller = new CameraIngestController(
      storage,
      new StreamTokenService(),
      new ThumbnailService(),
    );
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('generates an image thumbnail after a capture is stored', async () => {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    await controller.capture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
      undefined,
      'image/jpeg',
    );

    const thumbnailPath = storage.captureThumbnailPath('camera-1', 'capture-1');
    expect(existsSync(thumbnailPath)).toBe(true);
  }, 30_000);

  it('generates a timelapse-shaped capture thumbnail (same mechanism as image)', async () => {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    await controller.capture(
      requestFrom(jpeg),
      'camera-1',
      'timelapse-1',
      'VGA',
      '0',
      'image/jpeg',
    );
    await controller.capture(
      requestFrom(jpeg),
      'camera-1',
      'timelapse-1',
      'VGA',
      '1',
      'image/jpeg',
    );

    const thumbnailPath = storage.captureThumbnailPath(
      'camera-1',
      'timelapse-1',
    );
    expect(existsSync(thumbnailPath)).toBe(true);
  }, 30_000);

  it('does not generate a recording thumbnail until the manifest is complete', async () => {
    await controller.recordingPart(
      requestFrom(multipartPart(1)),
      'camera-1',
      'recording-1',
      '0',
      '2',
      'VGA',
      '4',
      '20',
      'multipart/x-mixed-replace; boundary=unitcams3-frame',
    );

    const thumbnailPath = storage.recordingThumbnailPath(
      'camera-1',
      'recording-1',
    );
    expect(existsSync(thumbnailPath)).toBe(false);

    await controller.recordingPart(
      requestFrom(multipartPart(1)),
      'camera-1',
      'recording-1',
      '1',
      '2',
      'VGA',
      '4',
      '20',
      'multipart/x-mixed-replace; boundary=unitcams3-frame',
    );

    expect(existsSync(thumbnailPath)).toBe(true);
  }, 30_000);

  it('generates a live-recording thumbnail via -vframes 1 when the live manifest completes', async () => {
    const upload = new PassThrough();
    const finished = controller.live(
      upload as unknown as Request,
      'camera-1',
      'live-1',
      'VGA',
      `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
    );
    upload.end(multipartPart(2));
    await finished;

    const thumbnailPath = storage.recordingThumbnailPath('camera-1', 'live-1');
    expect(existsSync(thumbnailPath)).toBe(true);
  }, 30_000);

  it('generates both waveform thumbnail variants after audio is stored', async () => {
    const wav = Buffer.from(TINY_WAV_BASE64, 'base64');
    await controller.audio(
      requestFrom(wav),
      'camera-1',
      'audio-1',
      '2',
      'audio/wav',
    );

    expect(
      existsSync(storage.audioThumbnailPath('camera-1', 'audio-1', 'dark')),
    ).toBe(true);
    expect(
      existsSync(storage.audioThumbnailPath('camera-1', 'audio-1', 'light')),
    ).toBe(true);
  }, 30_000);
});
