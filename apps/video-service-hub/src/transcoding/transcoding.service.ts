import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { existsSync } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
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
export class TranscodingService {
  private readonly logger = new Logger(TranscodingService.name);
  private readonly lock = new KeyedLock();

  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly storage: MediaStorageService,
  ) {}

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

  private async joinParts(
    partPaths: string[],
    joinedPath: string,
  ): Promise<void> {
    const output = createWriteStream(joinedPath, { flags: 'wx' });
    try {
      for (const partPath of partPaths) {
        await pipeline(createReadStream(partPath), output, { end: false });
      }
    } finally {
      output.end();
    }
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
    try {
      return (await stat(filePath)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}
