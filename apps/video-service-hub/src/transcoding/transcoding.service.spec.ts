import type { Request } from 'express';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
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

  async function storeCompletedLiveRecording(
    cameraId: string,
    requestId: string,
  ): Promise<void> {
    const upload = new PassThrough();
    const finished = storage.storeLive(
      upload as unknown as Request,
      cameraId,
      requestId,
      'VGA',
      `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
    );
    upload.end(multipartPart(3));
    await finished;
  }

  describe('ensureMp4 (dispatch between manifest-backed and live recordings)', () => {
    it('throws NotFoundException when neither source exists', async () => {
      await expect(
        transcoding.ensureMp4('camera-1', 'missing-recording'),
      ).rejects.toThrow('recording was not found');
    });

    it('transcodes a manifest-backed recording when a complete manifest exists', async () => {
      await storeCompleteRecording('camera-1', 'recording-1');
      const result = await transcoding.ensureMp4('camera-1', 'recording-1');
      expect(result.filePath).toBe(
        join(
          storageRoot,
          'recordings',
          'camera-1',
          'recording-1',
          'recording-1.mp4',
        ),
      );
    });

    it('transcodes a completed live recording when no manifest exists', async () => {
      await storeCompletedLiveRecording('camera-1', 'live-1');

      const result = await transcoding.ensureMp4('camera-1', 'live-1');

      expect(result.reused).toBe(false);
      expect(result.filePath).toBe(
        join(storageRoot, 'live', 'camera-1', 'live-1.mp4'),
      );
      expect(result.size).toBeGreaterThan(0);
      const mp4Bytes = await readFile(result.filePath);
      expect(mp4Bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    }, 30_000);

    it('resolveMp4Path matches ensureMp4 output for a live recording', async () => {
      await storeCompletedLiveRecording('camera-1', 'live-1');
      const result = await transcoding.ensureMp4('camera-1', 'live-1');
      expect(transcoding.resolveMp4Path('camera-1', 'live-1')).toBe(
        result.filePath,
      );
    }, 30_000);
  });

  describe('ensureTimelapseMp4', () => {
    async function storeTimelapseFrames(
      cameraId: string,
      requestId: string,
      frameCount: number,
    ): Promise<void> {
      const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
      for (let sequence = 0; sequence < frameCount; sequence += 1) {
        await storage.storeCapture(
          requestFrom(jpeg),
          cameraId,
          requestId,
          'VGA',
          sequence,
        );
      }
    }

    it('joins timelapse frames and encodes an MP4 at TIMELAPSE_FPS', async () => {
      await storeTimelapseFrames('camera-1', 'timelapse-1', 3);

      const result = await transcoding.ensureTimelapseMp4(
        'camera-1',
        'timelapse-1',
      );

      expect(result.fps).toBe(12);
      expect(result.reused).toBe(false);
      expect(result.filePath).toBe(
        join(
          storageRoot,
          'captures',
          'camera-1',
          'timelapse-1',
          'timelapse-1.mp4',
        ),
      );
      expect(result.size).toBeGreaterThan(0);

      const mp4Bytes = await readFile(result.filePath);
      expect(mp4Bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    }, 30_000);

    it('reuses an already-encoded timelapse MP4 when no new frame has arrived', async () => {
      await storeTimelapseFrames('camera-1', 'timelapse-1', 2);
      const first = await transcoding.ensureTimelapseMp4(
        'camera-1',
        'timelapse-1',
      );
      const second = await transcoding.ensureTimelapseMp4(
        'camera-1',
        'timelapse-1',
      );

      expect(first.reused).toBe(false);
      expect(second.reused).toBe(true);
      expect(second.size).toBe(first.size);
    }, 30_000);

    it('re-encodes once a new frame arrives after the cached MP4 was made', async () => {
      await storeTimelapseFrames('camera-1', 'timelapse-1', 2);
      const first = await transcoding.ensureTimelapseMp4(
        'camera-1',
        'timelapse-1',
      );
      await storeTimelapseFrames('camera-1', 'timelapse-1', 0);
      const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
      await storage.storeCapture(
        requestFrom(jpeg),
        'camera-1',
        'timelapse-1',
        'VGA',
        2,
      );

      const second = await transcoding.ensureTimelapseMp4(
        'camera-1',
        'timelapse-1',
      );

      expect(first.reused).toBe(false);
      expect(second.reused).toBe(false);
    }, 30_000);

    it('does not leave the temporary joined JPEG blob behind', async () => {
      await storeTimelapseFrames('camera-1', 'timelapse-1', 2);
      await transcoding.ensureTimelapseMp4('camera-1', 'timelapse-1');

      const leftovers = await readdir(join(storageRoot, '.tmp'));
      expect(leftovers).toEqual([]);
    }, 30_000);

    it('joins a frame count large enough to have tripped the old per-part-pipeline MaxListeners warning', async () => {
      const warnings: unknown[] = [];
      const originalWarning = process.listeners('warning');
      process.removeAllListeners('warning');
      process.on('warning', (warning) => warnings.push(warning));
      try {
        await storeTimelapseFrames('camera-1', 'timelapse-1', 25);
        const result = await transcoding.ensureTimelapseMp4(
          'camera-1',
          'timelapse-1',
        );
        expect(result.reused).toBe(false);
        expect(result.size).toBeGreaterThan(0);
      } finally {
        process.removeAllListeners('warning');
        for (const listener of originalWarning) {
          process.on('warning', listener as (warning: Error) => void);
        }
      }
      expect(
        warnings.some((warning) =>
          String((warning as Error).message).includes('MaxListenersExceededWarning'),
        ),
      ).toBe(false);
    }, 30_000);
  });

  describe('onModuleInit (startup backfill)', () => {
    async function storeTimelapseFrames(
      cameraId: string,
      requestId: string,
      frameCount: number,
    ): Promise<void> {
      const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
      for (let sequence = 0; sequence < frameCount; sequence += 1) {
        await storage.storeCapture(
          requestFrom(jpeg),
          cameraId,
          requestId,
          'VGA',
          sequence,
        );
      }
    }

    it('encodes an existing multi-frame timelapse left without an mp4', async () => {
      await storeTimelapseFrames('camera-1', 'timelapse-1', 3);

      await transcoding.onModuleInit();

      const mp4Bytes = await readFile(
        storage.captureMp4Path('camera-1', 'timelapse-1'),
      );
      expect(mp4Bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    }, 30_000);

    it('skips a single-frame capture (kind: image)', async () => {
      await storeTimelapseFrames('camera-1', 'image-1', 1);

      await transcoding.onModuleInit();

      await expect(
        readFile(storage.captureMp4Path('camera-1', 'image-1')),
      ).rejects.toThrow();
    });

    it('does not re-encode a timelapse that already has an up-to-date mp4', async () => {
      await storeTimelapseFrames('camera-1', 'timelapse-1', 2);
      await transcoding.ensureTimelapseMp4('camera-1', 'timelapse-1');
      const mtimeBefore = (await stat(storage.captureMp4Path('camera-1', 'timelapse-1'))).mtimeMs;

      await transcoding.onModuleInit();

      const mtimeAfter = (await stat(storage.captureMp4Path('camera-1', 'timelapse-1'))).mtimeMs;
      expect(mtimeAfter).toBe(mtimeBefore);
    }, 30_000);
  });

  describe('scheduleTimelapseEncodeAfterInactivity', () => {
    // A real (short) delay rather than fake timers: the debounced encode
    // spawns a real ffmpeg child process, whose completion Jest's fake
    // timers cannot fast-forward -- only the setTimeout wait itself.
    let debouncing: TranscodingService;

    beforeEach(() => {
      const config = loadServiceConfig({
        VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
        VIDEO_SERVICE_HUB_MQTT_PORT: '0',
        TIMELAPSE_ENCODE_INACTIVITY_MS: '300',
      });
      debouncing = new TranscodingService(config, storage);
    });

    afterEach(() => {
      debouncing.onModuleDestroy();
    });

    async function storeFrame(
      cameraId: string,
      requestId: string,
      sequence: number,
    ): Promise<void> {
      const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
      await storage.storeCapture(
        requestFrom(jpeg),
        cameraId,
        requestId,
        'VGA',
        sequence,
      );
    }

    function delay(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    it('encodes once frames stop arriving, not on every frame', async () => {
      await storeFrame('camera-1', 'timelapse-1', 0);
      debouncing.scheduleTimelapseEncodeAfterInactivity('camera-1', 'timelapse-1');
      await delay(200);

      await storeFrame('camera-1', 'timelapse-1', 1);
      debouncing.scheduleTimelapseEncodeAfterInactivity('camera-1', 'timelapse-1');

      // The first frame's timer would have fired by now (300ms) if each
      // frame didn't reset it -- confirming this isn't per-frame encoding.
      await delay(200);
      expect(existsSync(storage.captureMp4Path('camera-1', 'timelapse-1'))).toBe(
        false,
      );

      await delay(2_000);
      expect(existsSync(storage.captureMp4Path('camera-1', 'timelapse-1'))).toBe(
        true,
      );
    }, 10_000);

    it('does not encode a single-frame capture (kind: image)', async () => {
      await storeFrame('camera-1', 'image-1', 0);
      debouncing.scheduleTimelapseEncodeAfterInactivity('camera-1', 'image-1');

      await delay(2_000);

      expect(existsSync(storage.captureMp4Path('camera-1', 'image-1'))).toBe(
        false,
      );
    }, 10_000);
  });
});
