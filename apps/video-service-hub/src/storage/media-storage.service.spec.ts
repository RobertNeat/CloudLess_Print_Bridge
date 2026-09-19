import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { CameraRegistryService } from '../camera-registry/camera-registry.service';
import { loadServiceConfig } from '../config/service-config';
import { MediaStorageService } from './media-storage.service';

function fakeRegistry(
  entries: Record<string, { baseUrl: string; displayName?: string }> = {},
): CameraRegistryService {
  return {
    tryGet: (cameraId: string) =>
      entries[cameraId]
        ? {
            schemaVersion: 1,
            cameraId,
            baseUrl: entries[cameraId].baseUrl,
            displayName: entries[cameraId].displayName,
            createdAt: '',
            updatedAt: '',
          }
        : undefined,
  } as unknown as CameraRegistryService;
}

describe('MediaStorageService', () => {
  let storageRoot: string;
  let service: MediaStorageService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'video-service-hub-'));
    service = new MediaStorageService(
      loadServiceConfig({
        VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
        VIDEO_SERVICE_HUB_MQTT_PORT: '0',
      }),
      fakeRegistry({
        'camera-1': { baseUrl: 'http://192.168.1.205', displayName: 'front' },
      }),
    );
    await service.initialize();
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('stores a capture as a single complete part', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const first = await service.storeCapture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
    );
    const retry = await service.storeCapture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
    );

    expect(first).toMatchObject({ duplicate: false, complete: true });
    expect(retry).toMatchObject({ duplicate: true, complete: true });
    expect(
      await readFile(
        join(storageRoot, 'captures', 'camera-1', 'capture-1', '000.jpg'),
      ),
    ).toEqual(jpeg);
  });

  it('rejects a duplicate part number with different content', async () => {
    const partA = Buffer.from('--boundary\r\npart-a\r\n');
    const partB = Buffer.from('--boundary\r\npart-b\r\n');
    await service.storePart(
      requestFrom(partA),
      'recordings',
      'camera-1',
      'recording-x',
      {
        partNumber: 0,
        totalParts: 2,
        resolution: 'VGA',
        durationSeconds: 4,
        totalFrames: 20,
      },
    );

    await expect(
      service.storePart(
        requestFrom(partB),
        'recordings',
        'camera-1',
        'recording-x',
        {
          partNumber: 0,
          totalParts: 2,
          resolution: 'VGA',
          durationSeconds: 4,
          totalFrames: 20,
        },
      ),
    ).rejects.toThrow('existing file has different content');
  });

  it('reports manifest completeness only once every part is received', async () => {
    const partZero = Buffer.from('part-zero');
    const partOne = Buffer.from('part-one');
    const afterFirst = await service.storePart(
      requestFrom(partZero),
      'recordings',
      'camera-1',
      'recording-1',
      {
        partNumber: 0,
        totalParts: 2,
        resolution: 'VGA',
        durationSeconds: 4,
        totalFrames: 20,
      },
    );
    expect(afterFirst.complete).toBe(false);

    const afterSecond = await service.storePart(
      requestFrom(partOne),
      'recordings',
      'camera-1',
      'recording-1',
      {
        partNumber: 1,
        totalParts: 2,
        resolution: 'VGA',
        durationSeconds: 4,
        totalFrames: 20,
      },
    );
    expect(afterSecond.complete).toBe(true);
  });

  it('restores manifest state from disk after a restart', async () => {
    const part = Buffer.from('part-zero');
    await service.storePart(
      requestFrom(part),
      'recordings',
      'camera-1',
      'recording-1',
      {
        partNumber: 0,
        totalParts: 1,
        resolution: 'VGA',
        durationSeconds: 4,
        totalFrames: 20,
      },
    );

    const restarted = new MediaStorageService(
      loadServiceConfig({
        VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
        VIDEO_SERVICE_HUB_MQTT_PORT: '0',
      }),
      fakeRegistry(),
    );
    await restarted.initialize();

    expect(
      restarted.getManifest('recordings', 'camera-1', 'recording-1'),
    ).toMatchObject({
      complete: true,
    });

    await expect(
      restarted.storePart(
        requestFrom(part),
        'recordings',
        'camera-1',
        'recording-1',
        {
          partNumber: 0,
          totalParts: 1,
          resolution: 'VGA',
          durationSeconds: 4,
          totalFrames: 20,
        },
      ),
    ).resolves.toMatchObject({ duplicate: true, complete: true });
  });

  it('rejects an upload whose content does not match the provided X-Sha256', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    await expect(
      service.storeCapture(
        requestFrom(jpeg),
        'camera-1',
        'capture-bad-hash',
        'VGA',
        '0'.repeat(64),
      ),
    ).rejects.toThrow('X-Sha256 does not match the received content');
  });

  it('accepts an upload whose content matches the provided X-Sha256', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const digest = createHash('sha256').update(jpeg).digest('hex');
    await expect(
      service.storeCapture(
        requestFrom(jpeg),
        'camera-1',
        'capture-good-hash',
        'VGA',
        digest,
      ),
    ).resolves.toMatchObject({ complete: true });
  });

  it('respects the 8MB default per-kind byte limit', async () => {
    const oversized = Buffer.alloc(8 * 1024 * 1024 + 1, 1);
    await expect(
      service.storePart(
        requestFrom(oversized),
        'recordings',
        'camera-1',
        'recording-big',
        {
          partNumber: 0,
          totalParts: 1,
          resolution: 'VGA',
          durationSeconds: 1,
          totalFrames: 1,
        },
      ),
    ).rejects.toThrow(/exceeds the .* byte limit/);
  });

  it('fans out live data from the next complete MJPEG boundary', async () => {
    const upload = new PassThrough();
    const contentType = 'multipart/x-mixed-replace; boundary=unitcams3-frame';
    const oldFrame = Buffer.from(
      '--unitcams3-frame\r\nContent-Type: image/jpeg\r\n\r\nOLD\r\n',
    );
    const newFrame = Buffer.from(
      '--unitcams3-frame\r\nContent-Type: image/jpeg\r\n\r\nNEW\r\n',
    );
    const finished = service.storeLive(
      upload as unknown as Request,
      'camera-1',
      'live-1',
      'VGA',
      contentType,
    );
    await waitForLive(service);
    upload.write(oldFrame);
    const viewer = service.openLiveViewer('camera-1', 'live-1');
    const received = once(viewer.stream, 'data');
    upload.write(newFrame);

    const [chunk] = (await received) as [Buffer];
    expect(chunk).toEqual(newFrame);
    upload.end();
    await expect(finished).resolves.toMatchObject({
      stored: true,
      frames: 2,
      complete: true,
    });
  });

  describe('finalizeResource', () => {
    it('resolves the registered camera name/ip, renames the file, and writes metadata.json in place of manifest.json', async () => {
      const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
      await service.storeCapture(
        requestFrom(jpeg),
        'camera-1',
        'capture-1',
        'VGA',
      );
      const partPath = join(
        storageRoot,
        'captures',
        'camera-1',
        'capture-1',
        '000.jpg',
      );

      const metadata = await service.finalizeResource(
        'captures',
        'camera-1',
        'capture-1',
        partPath,
      );

      expect(metadata.fileName).toBe('image-front.jpg');
      expect(metadata.cameraName).toBe('front');
      expect(metadata.cameraIp).toBe('192.168.1.205');
      const directory = join(storageRoot, 'captures', 'camera-1', 'capture-1');
      expect(existsSync(join(directory, 'manifest.json'))).toBe(false);
      expect(existsSync(join(directory, 'metadata.json'))).toBe(true);
      expect(existsSync(join(directory, 'image-front.jpg'))).toBe(true);
    });

    it('falls back to the cameraId when the camera is unregistered, and omits the ip suffix', async () => {
      const jpeg = Buffer.from([0xff, 0xd8, 9, 9, 0xff, 0xd9]);
      await service.storeCapture(
        requestFrom(jpeg),
        'camera-unknown',
        'capture-2',
        'VGA',
      );
      const partPath = join(
        storageRoot,
        'captures',
        'camera-unknown',
        'capture-2',
        '000.jpg',
      );

      const metadata = await service.finalizeResource(
        'captures',
        'camera-unknown',
        'capture-2',
        partPath,
      );

      expect(metadata.fileName).toBe('image-camera-unknown.jpg');
      expect(metadata.cameraIp).toBeUndefined();
    });
  });

  describe('deletion cleans up sidecar thumbnails', () => {
    it('deleteResource removes the whole resource directory, thumbnail included', async () => {
      const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
      await service.storeCapture(
        requestFrom(jpeg),
        'camera-1',
        'capture-1',
        'VGA',
      );
      const thumbnailPath = service.thumbnailPath(
        'captures',
        'camera-1',
        'capture-1',
      );
      await writeFile(thumbnailPath, Buffer.from([1, 2, 3]));

      await service.deleteResource('captures', 'camera-1', 'capture-1');

      expect(existsSync(thumbnailPath)).toBe(false);
    });

    it('deleteResource removes both audio thumbnail variants', async () => {
      const wav = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WAVE'),
        Buffer.alloc(10),
      ]);
      await service.storePart(
        requestFrom(wav),
        'audio',
        'camera-1',
        'audio-1',
        {
          partNumber: 0,
          totalParts: 1,
          durationSeconds: 2,
        },
      );
      const darkThumbnailPath = service.audioThumbnailPath(
        'camera-1',
        'audio-1',
        'dark',
      );
      const lightThumbnailPath = service.audioThumbnailPath(
        'camera-1',
        'audio-1',
        'light',
      );
      await writeFile(darkThumbnailPath, Buffer.from([1, 2, 3]));
      await writeFile(lightThumbnailPath, Buffer.from([1, 2, 3]));

      await service.deleteResource('audio', 'camera-1', 'audio-1');

      expect(existsSync(darkThumbnailPath)).toBe(false);
      expect(existsSync(lightThumbnailPath)).toBe(false);
    });
  });
});

function requestFrom(content: Buffer): Request {
  const request = new PassThrough();
  request.end(content);
  return request as unknown as Request;
}

async function waitForLive(service: MediaStorageService): Promise<void> {
  // mkdir(..., { recursive: true }) resolves via the libuv threadpool, whose
  // completion callback runs in the poll phase -- a pure setImmediate loop
  // (check phase) can spin through its budget without ever yielding to it.
  // A short real timer forces an actual event-loop turn that includes I/O.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const status = service.getStatus();
    if ((status.activeLive as unknown[]).length > 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('live upload did not become active');
}
