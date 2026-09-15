import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
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
 * Joins the complete, ordered MJPEG parts of a finished recording (as
 * resolved from manifest.json by MediaStorageService) into a single MP4,
 * re-timed to TRANSCODING_FPS. Runs as post-processing, separate from the
 * ingest path: it only reads already-published recording parts and never
 * touches manifests.
 */
@Injectable()
export class TranscodingService {
  private readonly logger = new Logger(TranscodingService.name);
  private readonly lock = new KeyedLock();

  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly storage: MediaStorageService,
  ) {}

  async transcodeRecordingToMp4(
    cameraId: string,
    requestId: string,
  ): Promise<TranscodeResult> {
    const fps = this.config.transcoding.fps;
    const key = `${cameraId}:${requestId}`;
    return this.lock.run(`transcode:${key}`, async () => {
      const outputPath = this.mp4Path(cameraId, requestId);
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

      const partPaths = this.storage.recordingPartPaths(cameraId, requestId);
      const directory = join(
        this.config.storage.root,
        'recordings',
        cameraId,
        requestId,
      );
      await mkdir(directory, { recursive: true });
      const joinedPath = join(
        this.config.storage.root,
        '.tmp',
        `${cameraId}-${requestId}-${Date.now()}.mjpeg`,
      );
      const temporaryOutputPath = `${outputPath}.${Date.now()}.tmp`;

      try {
        await this.joinParts(partPaths, joinedPath);
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

  mp4Path(cameraId: string, requestId: string): string {
    return join(
      this.config.storage.root,
      'recordings',
      cameraId,
      requestId,
      `${requestId}.mp4`,
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
