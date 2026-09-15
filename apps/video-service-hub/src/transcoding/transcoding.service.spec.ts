import type { Request } from 'express';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { loadServiceConfig } from '../config/service-config';
import { MediaStorageService } from '../storage/media-storage.service';
import { TranscodingService } from './transcoding.service';

// A minimal, real 32x24 JPEG (produced by ffmpeg), so ffmpeg can actually
// decode it. Hand-rolled SOI/EOI byte pairs (as used in storage specs) are
// enough to satisfy MediaStorageService's format check but are not decodable
// video, which would make the ffmpeg assertions in this file meaningless.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAUHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAGAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjgDf0sAAAAAB/9k=';
const BOUNDARY = 'unitcams3-frame';

function requestFrom(buffer: Buffer): Request {
  const stream = new PassThrough();
  stream.end(buffer);
  return stream as unknown as Request;
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

describe('TranscodingService', () => {
  let storageRoot: string;
  let storage: MediaStorageService;
  let transcoding: TranscodingService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'video-service-hub-transcode-'));
    const config = loadServiceConfig({
      VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
      VIDEO_SERVICE_HUB_MQTT_PORT: '0',
      TRANSCODING_FPS: '12',
    });
    storage = new MediaStorageService(config);
    await storage.initialize();
    transcoding = new TranscodingService(config, storage);
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  async function storeCompleteRecording(
    cameraId: string,
    requestId: string,
  ): Promise<void> {
    await storage.storeRecordingPart(
      requestFrom(multipartPart(2)),
      cameraId,
      requestId,
      0,
      2,
      'VGA',
      1,
      4,
    );
    await storage.storeRecordingPart(
      requestFrom(multipartPart(2)),
      cameraId,
      requestId,
      1,
      2,
      'VGA',
      1,
      4,
    );
  }

  it('reads recording parts from manifest.json order, not filesystem order', async () => {
    await storeCompleteRecording('camera-1', 'recording-1');
    const partPaths = storage.recordingPartPaths('camera-1', 'recording-1');
    expect(partPaths).toEqual([
      join(
        storageRoot,
        'recordings',
        'camera-1',
        'recording-1',
        'part-0000.mjpeg',
      ),
      join(
        storageRoot,
        'recordings',
        'camera-1',
        'recording-1',
        'part-0001.mjpeg',
      ),
    ]);
  });

  it('rejects transcoding an incomplete recording', async () => {
    await storage.storeRecordingPart(
      requestFrom(multipartPart(1)),
      'camera-1',
      'recording-1',
      0,
      2,
      'VGA',
      1,
      2,
    );

    await expect(
      transcoding.transcodeRecordingToMp4('camera-1', 'recording-1'),
    ).rejects.toThrow('recording was not found');
  });

  it('joins MJPEG parts and encodes an MP4 at TRANSCODING_FPS', async () => {
    await storeCompleteRecording('camera-1', 'recording-1');

    const result = await transcoding.transcodeRecordingToMp4(
      'camera-1',
      'recording-1',
    );

    expect(result.fps).toBe(12);
    expect(result.reused).toBe(false);
    expect(result.filePath).toBe(
      join(
        storageRoot,
        'recordings',
        'camera-1',
        'recording-1',
        'recording-1.mp4',
      ),
    );
    expect(result.size).toBeGreaterThan(0);

    const mp4Bytes = await readFile(result.filePath);
    // ftyp box: bytes 4-7 must spell "ftyp" for a valid ISO base media file.
    expect(mp4Bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
  }, 30_000);

  it('reuses an already-transcoded MP4 instead of re-encoding', async () => {
    await storeCompleteRecording('camera-1', 'recording-1');
    const first = await transcoding.transcodeRecordingToMp4(
      'camera-1',
      'recording-1',
    );
    const second = await transcoding.transcodeRecordingToMp4(
      'camera-1',
      'recording-1',
    );

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.size).toBe(first.size);
  }, 30_000);

  it('does not leave the temporary joined MJPEG behind', async () => {
    await storeCompleteRecording('camera-1', 'recording-1');
    await transcoding.transcodeRecordingToMp4('camera-1', 'recording-1');

    const leftovers = await readdir(join(storageRoot, '.tmp'));
    expect(leftovers).toEqual([]);
  }, 30_000);
});
