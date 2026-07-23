import type { Request } from 'express';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { loadServiceConfig } from '../config/service-config';
import { MediaStorageService } from './media-storage.service';

describe('MediaStorageService', () => {
  let storageRoot: string;
  let service: MediaStorageService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'video-service-hub-'));
    service = new MediaStorageService(
      loadServiceConfig({
        STORAGE_PATH: storageRoot,
        MQTT_PORT: '0',
      }),
    );
    await service.initialize();
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('stores an explicitly sequenced capture idempotently', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const first = await service.storeCapture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
      0,
    );
    const retry = await service.storeCapture(
      requestFrom(jpeg),
      'camera-1',
      'capture-1',
      'VGA',
      0,
    );

    expect(first).toMatchObject({ sequence: 0, duplicate: false });
    expect(retry).toMatchObject({ sequence: 0, duplicate: true });
    expect(
      await readFile(
        join(storageRoot, 'captures', 'camera-1', 'capture-1', '000000.jpg'),
      ),
    ).toEqual(jpeg);
  });

  it('restores recording state from manifests after restart', async () => {
    const part = Buffer.from('--unitcams3-frame\r\npart-zero\r\n');
    await service.storeRecordingPart(
      requestFrom(part),
      'camera-1',
      'recording-1',
      0,
      1,
      'VGA',
      4,
      20,
    );

    const restarted = new MediaStorageService(
      loadServiceConfig({ STORAGE_PATH: storageRoot, MQTT_PORT: '0' }),
    );
    await restarted.initialize();

    expect(restarted.getStatus()).toMatchObject({
      recordingCount: 1,
      completedRecordingCount: 1,
    });

    await expect(
      restarted.storeRecordingPart(
        requestFrom(part),
        'camera-1',
        'recording-1',
        0,
        1,
        'VGA',
        4,
        20,
      ),
    ).resolves.toMatchObject({
      duplicate: true,
      recordingComplete: true,
    });
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
    });
  });
});

function requestFrom(content: Buffer): Request {
  const request = new PassThrough();
  request.end(content);
  return request as unknown as Request;
}

async function waitForLive(service: MediaStorageService): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = service.getStatus();
    if ((status.activeLive as unknown[]).length > 0) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('live upload did not become active');
}
