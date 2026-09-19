import type { Request } from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { CameraRegistryService } from '../camera-registry/camera-registry.service';
import { loadServiceConfig } from '../config/service-config';
import { MediaStorageService } from '../storage/media-storage.service';
import { TranscodingService } from './transcoding.service';

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAUHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAGAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjgDf0sAAAAAB/9k=';
const BOUNDARY = 'unitcams3-frame';

function requestFrom(content: Buffer): Request {
  const request = new PassThrough();
  request.end(content);
  return request as unknown as Request;
}

function multipartFrame(): Buffer {
  const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\n\r\n`),
    jpeg,
    Buffer.from('\r\n'),
  ]);
}

function fakeRegistry(): CameraRegistryService {
  return {
    tryGet: (cameraId: string) =>
      cameraId === 'camera-1'
        ? {
            schemaVersion: 1 as const,
            cameraId,
            baseUrl: 'http://192.168.1.205',
            displayName: 'front',
            createdAt: '',
            updatedAt: '',
          }
        : undefined,
  } as unknown as CameraRegistryService;
}

describe('TranscodingService.finalize', () => {
  let storageRoot: string;
  let storage: MediaStorageService;
  let transcoding: TranscodingService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'video-service-hub-transcode-'));
    const config = loadServiceConfig({
      VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
      VIDEO_SERVICE_HUB_MQTT_PORT: '0',
    });
    storage = new MediaStorageService(config, fakeRegistry());
    await storage.initialize();
    transcoding = new TranscodingService(config, storage);
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('finalizes a completed capture (single JPEG, no encode) using the registered camera name/ip', async () => {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    await storage.storeCapture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
    );

    const metadata = await transcoding.finalize(
      'captures',
      'camera-1',
      'capture-1',
    );

    expect(metadata.fileName).toBe('image-front.jpg');
    expect(
      storage.getManifest('captures', 'camera-1', 'capture-1'),
    ).toBeUndefined();
  }, 30_000);

  it('joins timelapse JPEG parts and encodes them to an mp4', async () => {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    await storage.storePart(
      requestFrom(jpeg),
      'timelapses',
      'camera-1',
      'timelapse-1',
      {
        partNumber: 0,
        totalParts: 2,
        resolution: 'VGA',
      },
    );
    await storage.storePart(
      requestFrom(jpeg),
      'timelapses',
      'camera-1',
      'timelapse-1',
      {
        partNumber: 1,
        totalParts: 2,
        resolution: 'VGA',
      },
    );

    const metadata = await transcoding.finalize(
      'timelapses',
      'camera-1',
      'timelapse-1',
    );

    expect(metadata.fileName).toBe('timelapse-front.mp4');
    expect(metadata.size).toBeGreaterThan(0);
  }, 30_000);

  it('joins recording MJPEG parts and encodes them to an mp4', async () => {
    await storage.storePart(
      requestFrom(multipartFrame()),
      'recordings',
      'camera-1',
      'recording-1',
      {
        partNumber: 0,
        totalParts: 1,
        resolution: 'VGA',
        durationSeconds: 4,
        totalFrames: 1,
      },
    );

    const metadata = await transcoding.finalize(
      'recordings',
      'camera-1',
      'recording-1',
    );

    expect(metadata.fileName).toBe('recording-front.mp4');
  }, 30_000);

  it('is idempotent: calling finalize twice reuses the already-finalized metadata', async () => {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    await storage.storeCapture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
    );
    const first = await transcoding.finalize(
      'captures',
      'camera-1',
      'capture-1',
    );
    const second = await transcoding.finalize(
      'captures',
      'camera-1',
      'capture-1',
    );
    expect(second).toEqual(first);
  }, 30_000);
});
