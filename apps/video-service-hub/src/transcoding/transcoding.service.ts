import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { existsSync } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { KeyedLock } from '../common/keyed-lock';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { MediaStorageService } from '../storage/media-storage.service';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export type TranscodeResult = {
  cameraId: string;
  requestId: string;
  fps: number;
  filePath: string;
  size: number;
  reused: boolean;
};

/**
 * Turns a recording's MJPEG source into a single MP4, re-timed to
 * TRANSCODING_FPS. Runs as post-processing, separate from the ingest path:
 * it only reads already-published media and never touches manifests.
 *
 * Two distinct sources share this pipeline, both surfaced to clients as
 * kind: 'recording' by MediaLibraryService:
 *  - manifest-backed recordings: multiple MJPEG parts joined in manifest
 *    order (MediaStorageService.recordingPartPaths);
 *  - completed live recordings: a single already-complete MJPEG file
 *    (MediaStorageService.liveRecordingFilePath), with no manifest.
 */
@Injectable()
export class TranscodingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranscodingService.name);
  private readonly lock = new KeyedLock();
  private readonly inactivityTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly storage: MediaStorageService,
  ) {}

  /**
   * Backfills MP4s for any multi-frame timelapse left over from before this
   * feature existed, or from a session whose debounced encode
   * (scheduleTimelapseEncodeAfterInactivity) never fired -- a hub restart
   * mid-session, for example. Runs once at boot, sequentially (not
   * Promise.all): each encode already spawns an ffmpeg process, and this
   * avoids starting one per timelapse all at once.
   */
  async onModuleInit(): Promise<void> {
    const pending = this.storage
      .listCaptureManifests()
      .filter((manifest) => manifest.captures.length > 1)
      .filter(
        (manifest) =>
          !existsSync(this.storage.captureMp4Path(manifest.cameraId, manifest.requestId)),
      );
    for (const manifest of pending) {
      try {
        await this.ensureTimelapseMp4(manifest.cameraId, manifest.requestId);
      } catch (error) {
        this.logger.warn(
          `Startup timelapse backfill failed for ${manifest.cameraId}/${manifest.requestId}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Resolves which of the two recording sources (manifest-backed or
   * completed live) matches cameraId/requestId, then transcodes it.
   * Throws NotFoundException if neither exists.
   */
  async ensureMp4(
    cameraId: string,
    requestId: string,
  ): Promise<TranscodeResult> {
    if (this.hasRecordingManifest(cameraId, requestId)) {
      return this.transcodeRecordingToMp4(cameraId, requestId);
    }
    if (existsSync(this.storage.liveRecordingFilePath(cameraId, requestId))) {
      return this.transcodeLiveRecordingToMp4(cameraId, requestId);
    }
    throw new NotFoundException('recording was not found');
  }

  async transcodeRecordingToMp4(
    cameraId: string,
    requestId: string,
  ): Promise<TranscodeResult> {
    const outputPath = this.mp4Path(cameraId, requestId);
    return this.transcode(cameraId, requestId, outputPath, () => {
      const partPaths = this.storage.recordingPartPaths(cameraId, requestId);
      return {
        sourcePaths: partPaths,
        outputDirectory: this.recordingDirectory(cameraId, requestId),
      };
    });
  }

  async transcodeLiveRecordingToMp4(
    cameraId: string,
    requestId: string,
  ): Promise<TranscodeResult> {
    const sourcePath = this.storage.liveRecordingFilePath(cameraId, requestId);
    if (!existsSync(sourcePath)) {
      throw new NotFoundException('recording was not found');
    }
    const outputPath = this.liveMp4Path(cameraId, requestId);
    return this.transcode(cameraId, requestId, outputPath, () => ({
      sourcePaths: [sourcePath],
      outputDirectory: join(this.config.storage.root, 'live', cameraId),
    }));
  }

  private async transcode(
    cameraId: string,
    requestId: string,
    outputPath: string,
    resolveSource: () => { sourcePaths: string[]; outputDirectory: string },
  ): Promise<TranscodeResult> {
    const fps = this.config.transcoding.fps;
    const key = `${cameraId}:${requestId}`;
    return this.lock.run(`transcode:${key}`, async () => {
      const existingSize = await this.fileSize(outputPath);
      if (existingSize !== undefined) {
        return {
          cameraId,
          requestId,
          fps,
          filePath: outputPath,
          size: existingSize,
          reused: true,
        };
      }

      const { sourcePaths, outputDirectory } = resolveSource();
      await mkdir(outputDirectory, { recursive: true });
      const joinedPath = join(
        this.config.storage.root,
        '.tmp',
        `${cameraId}-${requestId}-${Date.now()}.mjpeg`,
      );
      const temporaryOutputPath = `${outputPath}.${Date.now()}.tmp`;

      try {
        await this.joinParts(sourcePaths, joinedPath);
        await this.encodeToMp4(joinedPath, temporaryOutputPath, fps);
        await rename(temporaryOutputPath, outputPath);
      } finally {
        await rm(joinedPath, { force: true });
        await rm(temporaryOutputPath, { force: true });
      }

      const size = await this.fileSize(outputPath);
      if (size === undefined) {
        throw new InternalServerErrorException(
          'transcoding finished but the output file is missing',
        );
      }
      return {
        cameraId,
        requestId,
        fps,
        filePath: outputPath,
        size,
        reused: false,
      };
    });
  }

  /** Where a finished MP4 lives, regardless of which source produced it. */
  resolveMp4Path(cameraId: string, requestId: string): string {
    const manifestBacked = this.mp4Path(cameraId, requestId);
    if (
      existsSync(manifestBacked) ||
      this.hasRecordingManifest(cameraId, requestId)
    ) {
      return manifestBacked;
    }
    return this.liveMp4Path(cameraId, requestId);
  }

  mp4Path(cameraId: string, requestId: string): string {
    return join(
      this.recordingDirectory(cameraId, requestId),
      `${requestId}.mp4`,
    );
  }

  liveMp4Path(cameraId: string, requestId: string): string {
    return join(this.config.storage.root, 'live', cameraId, `${requestId}.mp4`);
  }

  /**
   * Encodes a timelapse's capture frames (JPEG stills, ordered by
   * CaptureEntry.sequence) into an MP4 at TIMELAPSE_FPS. Unlike a recording's
   * fixed part set, a timelapse's frame set can keep growing after an MP4
   * has already been cached (storeCapture accepts new frames at any time),
   * so the cached file is invalidated -- and re-encoded -- whenever a frame
   * newer than it has arrived, rather than being reused unconditionally.
   */
  async ensureTimelapseMp4(
    cameraId: string,
    requestId: string,
  ): Promise<TranscodeResult> {
    const fps = this.config.timelapse.fps;
    const outputPath = this.storage.captureMp4Path(cameraId, requestId);
    const key = `timelapse:${cameraId}:${requestId}`;
    return this.lock.run(`transcode:${key}`, async () => {
      const existing = await this.fileInfo(outputPath);
      if (existing && !(await this.timelapseIsStale(cameraId, requestId, existing.mtimeMs))) {
        return {
          cameraId,
          requestId,
          fps,
          filePath: outputPath,
          size: existing.size,
          reused: true,
        };
      }

      const framePaths = this.storage.capturePartPaths(cameraId, requestId);
      const outputDirectory = join(
        this.config.storage.root,
        'captures',
        cameraId,
        requestId,
      );
      await mkdir(outputDirectory, { recursive: true });
      const joinedPath = join(
        this.config.storage.root,
        '.tmp',
        `${cameraId}-${requestId}-${Date.now()}.jpegs`,
      );
      const temporaryOutputPath = `${outputPath}.${Date.now()}.tmp`;

      try {
        await this.joinParts(framePaths, joinedPath);
        await this.encodeFramesToMp4(joinedPath, temporaryOutputPath, fps);
        await rename(temporaryOutputPath, outputPath);
      } finally {
        await rm(joinedPath, { force: true });
        await rm(temporaryOutputPath, { force: true });
      }

      const size = await this.fileSize(outputPath);
      if (size === undefined) {
        throw new InternalServerErrorException(
          'transcoding finished but the output file is missing',
        );
      }
      return {
        cameraId,
        requestId,
        fps,
        filePath: outputPath,
        size,
        reused: false,
      };
    });
  }

  resolveTimelapseMp4Path(cameraId: string, requestId: string): string {
    return this.storage.captureMp4Path(cameraId, requestId);
  }

  /** Cancels pending debounced encodes so none fire against storage that may already be torn down. */
  onModuleDestroy(): void {
    for (const timer of this.inactivityTimers.values()) clearTimeout(timer);
    this.inactivityTimers.clear();
  }

  /**
   * Debounces a timelapse's encode to fire once frames stop arriving,
   * rather than at a fixed time after the camera command was sent: capture
   * and upload are decoupled on the camera (frames are written to SD during
   * the capture window, then drained to the hub afterward by a separate
   * task -- see firmware/.../video_service.cpp's uploadTask), so no fixed
   * delay derived from the command's durationMs can reliably predict when
   * the last frame actually lands. Call this after every stored capture
   * frame; each call resets the same request's timer. Not a per-frame
   * re-encode -- ensureTimelapseMp4 only actually runs once inactivity
   * lasts config.timelapse.encodeInactivityMs, and its own staleness check
   * is the backstop if a late frame still slips in after that.
   */
  scheduleTimelapseEncodeAfterInactivity(
    cameraId: string,
    requestId: string,
  ): void {
    const key = `${cameraId}:${requestId}`;
    const existing = this.inactivityTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.inactivityTimers.delete(key);
      if (this.storage.captureFrameCount(cameraId, requestId) <= 1) return;
      this.ensureTimelapseMp4(cameraId, requestId).catch((error: Error) => {
        this.logger.warn(
          `Debounced timelapse encode failed for ${key}: ${error.message}`,
        );
      });
    }, this.config.timelapse.encodeInactivityMs);
    this.inactivityTimers.set(key, timer);
  }

  /**
   * Compares the newest frame's storedAt against the mp4's mtime (set when
   * ffmpeg finishes, not when the request started), so a frame that lands
   * mid-encode can predate the mp4 it wasn't actually included in -- it
   * self-heals on the next frame, except when it's the last frame of the
   * capture session, which can then be permanently missing from the mp4.
   * Acceptable for now: exact correctness would mean keying the cache on
   * frame count instead of mtime.
   */
  private async timelapseIsStale(
    cameraId: string,
    requestId: string,
    mp4MtimeMs: number,
  ): Promise<boolean> {
    const lastStoredAt = this.storage.captureLastStoredAt(cameraId, requestId);
    if (!lastStoredAt) return false;
    return Date.parse(lastStoredAt) > mp4MtimeMs;
  }

  private encodeFramesToMp4(
    inputPath: string,
    outputPath: string,
    fps: number,
  ): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      ffmpeg(inputPath)
        .inputFormat('image2pipe')
        // image2pipe cannot sniff a codec from a raw concatenated-JPEG blob
        // (no container framing to inspect), so the decoder must be named
        // explicitly -- without this ffmpeg fails with "no decoder found for:
        // none" even though the bytes are valid JPEGs.
        .inputOptions(['-c:v', 'mjpeg'])
        .inputFPS(fps)
        .videoCodec('libx264')
        .format('mp4')
        .outputOptions([
          '-pix_fmt',
          'yuv420p',
          '-r',
          String(fps),
          '-movflags',
          '+faststart',
        ])
        .on('error', (error: Error) => {
          this.logger.error(`ffmpeg timelapse encoding failed: ${error.message}`);
          reject(
            new InternalServerErrorException('failed to encode timelapse'),
          );
        })
        .on('end', () => resolvePromise())
        .save(outputPath);
    });
  }

  private recordingDirectory(cameraId: string, requestId: string): string {
    return join(this.config.storage.root, 'recordings', cameraId, requestId);
  }

  private hasRecordingManifest(cameraId: string, requestId: string): boolean {
    return this.storage
      .listRecordingManifests()
      .some(
        (manifest) =>
          manifest.cameraId === cameraId &&
          manifest.requestId === requestId &&
          manifest.complete,
      );
  }

  /**
   * Concatenates every part into one file via a single pipeline over an
   * async-generator source, rather than one pipeline per part sharing the
   * same destination stream: the latter attaches a fresh set of listeners
   * to the shared WriteStream on every part (MaxListenersExceededWarning
   * once a timelapse has more than ~10 frames) and, worse, calls
   * output.end() without awaiting its 'close', risking a truncated file if
   * ffmpeg opens it before the last write actually flushes.
   */
  private async joinParts(
    partPaths: string[],
    joinedPath: string,
  ): Promise<void> {
    async function* readParts(): AsyncGenerator<Buffer> {
      for (const partPath of partPaths) {
        yield* createReadStream(partPath);
      }
    }
    await pipeline(
      Readable.from(readParts()),
      createWriteStream(joinedPath, { flags: 'wx' }),
    );
  }

  private encodeToMp4(
    inputPath: string,
    outputPath: string,
    fps: number,
  ): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      ffmpeg(inputPath)
        .inputFormat('mpjpeg')
        .inputFPS(fps)
        .videoCodec('libx264')
        // The temporary output path does not end in .mp4 (it carries a
        // .tmp suffix so a crash mid-encode never leaves a file that looks
        // published), so ffmpeg cannot infer the container from the
        // extension and must be told explicitly.
        .format('mp4')
        .outputOptions([
          '-pix_fmt',
          'yuv420p',
          '-r',
          String(fps),
          '-movflags',
          '+faststart',
        ])
        .on('error', (error: Error) => {
          this.logger.error(`ffmpeg transcoding failed: ${error.message}`);
          reject(
            new InternalServerErrorException('failed to transcode recording'),
          );
        })
        .on('end', () => resolvePromise())
        .save(outputPath);
    });
  }

  private async fileSize(filePath: string): Promise<number | undefined> {
    const info = await this.fileInfo(filePath);
    return info?.size;
  }

  private async fileInfo(
    filePath: string,
  ): Promise<{ size: number; mtimeMs: number } | undefined> {
    try {
      const info = await stat(filePath);
      return { size: info.size, mtimeMs: info.mtimeMs };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}
