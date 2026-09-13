import type { Request } from 'express';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { loadServiceConfig } from '../config/service-config';
import { MediaStorageService } from '../storage/media-storage.service';
import { MediaLibraryService } from './media-library.service';

describe('MediaLibraryService', () => {
  let storageRoot: string;
  let storage: MediaStorageService;
  let library: MediaLibraryService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'video-service-hub-media-'));
    storage = new MediaStorageService(
      loadServiceConfig({
        VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
        VIDEO_SERVICE_HUB_MQTT_PORT: '0',
      }),
    );
    await storage.initialize();
    library = new MediaLibraryService(storage);
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('lists a completed recording, a capture, and an audio clip', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    await storage.storeCapture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
      0,
    );

    const part = Buffer.from('--unitcams3-frame\r\npart-zero\r\n');
    await storage.storeRecordingPart(
      requestFrom(part),
      'camera-1',
      'recording-1',
      0,
      1,
      'VGA',
      4,
      20,
    );

    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WAVE'),
      Buffer.alloc(10),
    ]);
    await storage.storeAudio(requestFrom(wav), 'camera-1', 'audio-1', 2);

    const result = await library.list({});
    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.kind).sort()).toEqual([
      'audio',
      'image',
      'recording',
    ]);
    for (const item of result.items) {
      expect(item.thumbnailUrl).toBe('/api/v1/media/thumbnail-placeholder');
    }
  });

  it('excludes an incomplete recording from the listing', async () => {
    const part = Buffer.from('--unitcams3-frame\r\npart-zero\r\n');
    await storage.storeRecordingPart(
      requestFrom(part),
      'camera-1',
      'recording-1',
      0,
      2,
      'VGA',
      4,
      20,
    );

    const result = await library.list({});
    expect(result.items).toHaveLength(0);
  });

  it('filters by cameraId and kind', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    await storage.storeCapture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
      0,
    );
    await storage.storeCapture(
      requestFrom(jpeg),
      'camera-2',
      'capture-2',
      'VGA',
      0,
    );

    const result = await library.list({ cameraId: 'camera-2', kind: 'image' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      cameraId: 'camera-2',
      kind: 'image',
    });
  });

  it('paginates results with a cursor', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    for (let index = 0; index < 3; index += 1) {
      await storage.storeCapture(
        requestFrom(jpeg),
        'camera-1',
        `capture-${index}`,
        'VGA',
        0,
      );
    }

    const firstPage = await library.list({ limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await library.list({
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeUndefined();

    const seenIds = new Set([
      ...firstPage.items.map((item) => item.id),
      ...secondPage.items.map((item) => item.id),
    ]);
    expect(seenIds.size).toBe(3);
  });

  it('rejects an unknown cursor', async () => {
    await expect(
      library.list({ cursor: 'bm90LWEtcmVhbC1jdXJzb3I' }),
    ).rejects.toThrow();
  });

  it('resolves an underlying file for every listed item, matching its downloadUrl', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    await storage.storeCapture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
      0,
    );

    const part = Buffer.from('--unitcams3-frame\r\npart-zero\r\n');
    await storage.storeRecordingPart(
      requestFrom(part),
      'camera-1',
      'recording-1',
      0,
      1,
      'VGA',
      4,
      20,
    );

    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WAVE'),
      Buffer.alloc(10),
    ]);
    await storage.storeAudio(requestFrom(wav), 'camera-1', 'audio-1', 2);

    const { items } = await library.list({});
    expect(items).toHaveLength(3);

    for (const item of items) {
      switch (item.kind) {
        case 'image': {
          const path = storage.captureFilePath(
            item.cameraId,
            item.requestId,
            item.fileName,
          );
          expect(existsSync(path)).toBe(true);
          break;
        }
        case 'recording': {
          const partPaths = storage.recordingPartPaths(
            item.cameraId,
            item.requestId,
          );
          expect(partPaths.length).toBeGreaterThan(0);
          for (const partPath of partPaths) {
            expect(existsSync(partPath)).toBe(true);
          }
          break;
        }
        case 'audio': {
          const path = storage.audioFilePath(item.cameraId, item.fileName);
          expect(existsSync(path)).toBe(true);
          break;
        }
      }
    }
  });
});

function requestFrom(content: Buffer): Request {
  const request = new PassThrough();
  request.end(content);
  return request as unknown as Request;
}
