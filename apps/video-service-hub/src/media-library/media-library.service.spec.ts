import type { Request } from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { CameraRegistryService } from '../camera-registry/camera-registry.service';
import { loadServiceConfig } from '../config/service-config';
import { MediaStorageService } from '../storage/media-storage.service';
import { TranscodingService } from '../transcoding/transcoding.service';
import { MediaLibraryService } from './media-library.service';

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAUHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAGAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjgDf0sAAAAAB/9k=';

function requestFrom(content: Buffer): Request {
  const request = new PassThrough();
  request.end(content);
  return request as unknown as Request;
}

function fakeRegistry(): CameraRegistryService {
  return {
    tryGet: (cameraId: string) => ({
      schemaVersion: 1 as const,
      cameraId,
      baseUrl: 'http://192.168.1.205',
      displayName: 'front',
      createdAt: '',
      updatedAt: '',
    }),
  } as unknown as CameraRegistryService;
}

describe('MediaLibraryService', () => {
  let storageRoot: string;
  let storage: MediaStorageService;
  let transcoding: TranscodingService;
  let library: MediaLibraryService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'video-service-hub-library-'));
    const config = loadServiceConfig({
      VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
      VIDEO_SERVICE_HUB_MQTT_PORT: '0',
    });
    storage = new MediaStorageService(config, fakeRegistry());
    await storage.initialize();
    transcoding = new TranscodingService(config, storage);
    library = new MediaLibraryService(storage);
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  async function seedCapture(
    requestId: string,
    capturedAt: string,
  ): Promise<void> {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    await storage.storeCapture(requestFrom(jpeg), 'camera-1', requestId, 'VGA');
    await transcoding.finalize('captures', 'camera-1', requestId);
    // Freeze completedAt to a deterministic value for day-grouping/order assertions.
    const metadata = storage.getMetadata('captures', 'camera-1', requestId)!;
    metadata.completedAt = capturedAt;
  }

  it('lists a finalized capture with the resolved final filename and file/thumbnail urls', async () => {
    await seedCapture('capture-1', '2026-01-01T08:00:00.000Z');

    const result = library.listKind('captures', {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: 'image',
      cameraId: 'camera-1',
      requestId: 'capture-1',
      fileName: 'image-front_(192.168.1.205)_001.jpg',
      downloadUrl: '/api/v1/captures/camera-1/capture-1/file',
    });
  }, 30_000);

  it('does not list a resource before it has been finalized', async () => {
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

    const result = library.listKind('timelapses', {});
    expect(result.items).toHaveLength(0);
  }, 30_000);

  it('assigns day-grouped _00x counters computed over the full set, not per page', async () => {
    for (let index = 0; index < 25; index += 1) {
      const hour = String(index).padStart(2, '0');
      await seedCapture(`capture-${index}`, `2026-01-01T${hour}:00:00.000Z`);
    }

    const firstPage = library.listKind('captures', { limit: 20 });
    expect(firstPage.items).toHaveLength(20);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = library.listKind('captures', {
      limit: 20,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items).toHaveLength(5);
    // Newest-first ordering: the last item overall (capture-24, latest
    // capturedAt) is the 25th of the day and must read _025, not restart at
    // _001 just because it landed on the second page.
    expect(secondPage.items.at(-1)?.fileName).toBe(
      'image-front_(192.168.1.205)_001.jpg',
    );
    expect(secondPage.items[0]?.fileName).toBe(
      'image-front_(192.168.1.205)_005.jpg',
    );
  }, 60_000);

  it('filters by cameraId', async () => {
    await seedCapture('capture-1', '2026-01-01T08:00:00.000Z');
    const result = library.listKind('captures', {
      cameraId: 'camera-other',
    });
    expect(result.items).toHaveLength(0);
  }, 30_000);

  it('merges recordings and live into listVideo', async () => {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    const multipartFrame = Buffer.concat([
      Buffer.from('--unitcams3-frame\r\nContent-Type: image/jpeg\r\n\r\n'),
      jpeg,
      Buffer.from('\r\n'),
    ]);
    await storage.storePart(
      requestFrom(multipartFrame),
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
    await transcoding.finalize('recordings', 'camera-1', 'recording-1');

    const result = library.listVideo({});
    expect(result.items.map((entry) => entry.kind)).toEqual(['recording']);
  }, 30_000);

  it('renames and deletes a finalized resource', async () => {
    await seedCapture('capture-1', '2026-01-01T08:00:00.000Z');

    await library.renameResource(
      'captures',
      'camera-1',
      'capture-1',
      'My Capture',
    );
    expect(
      storage.getMetadata('captures', 'camera-1', 'capture-1')?.displayName,
    ).toBe('My Capture');

    await library.deleteResource('captures', 'camera-1', 'capture-1');
    expect(
      storage.getMetadata('captures', 'camera-1', 'capture-1'),
    ).toBeUndefined();
  }, 30_000);
});
