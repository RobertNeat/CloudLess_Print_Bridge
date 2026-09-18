import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { KeyedLock } from '../common/keyed-lock';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { MediaStorageService } from '../storage/media-storage.service';
import type {
  MediaResourceKind,
  ResourceMetadata,
} from '../storage/storage.types';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Produces the single finished file for a completed resource and hands it to
 * MediaStorageService.finalizeResource for renaming/metadata.json writing.
 * Triggered eagerly and synchronously from the ingest path the moment a
 * resource's manifest reports `complete: true` -- there is no client-visible
 * "transcode" step or endpoint; the client only ever sees the finished file.
 *
 * - captures: already a single JPEG, no encode needed -- just finalize.
 * - timelapses: JPEG stills joined and encoded at TIMELAPSE_FPS.
 * - recordings / live: MJPEG parts joined and encoded at TRANSCODING_FPS.
 * - audio: WAV parts concatenated (parts share one PCM stream, so a plain
 *   byte-join reproduces a valid WAV once the header is fixed up)
 */
@Injectable()
export class TranscodingService {
  private readonly logger = new Logger(TranscodingService.name);
  private readonly lock = new KeyedLock();

  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly storage: MediaStorageService,
  ) {}

  /** Runs the appropriate pipeline for `kind`, then finalizes the resource. Safe to call more than once (finalize is a no-op past the first successful run since parts get deleted). */
  async finalize(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): Promise<ResourceMetadata> {
    const key = `${kind}:${cameraId}:${requestId}`;
    return this.lock.run(key, async () => {
      const existing = this.storage.getMetadata(kind, cameraId, requestId);
      if (existing) return existing;

      const producedPath =
        kind === 'captures'
          ? this.storage.partPaths(kind, cameraId, requestId)[0]
          : await this.produceFinalFile(kind, cameraId, requestId);

      return this.storage.finalizeResource(
        kind,
        cameraId,
        requestId,
        producedPath,
      );
    });
  }

  private async produceFinalFile(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): Promise<string> {
    const partPaths = this.storage.partPaths(kind, cameraId, requestId);
    const stagingPath = join(
      this.config.storage.root,
      '.tmp',
      `${kind}-${cameraId}-${requestId}-${Date.now()}.output`,
    );

    try {
      if (kind === 'audio') {
        await this.joinWaveParts(partPaths, stagingPath);
      } else if (kind === 'timelapses') {
        const joinedPath = `${stagingPath}.jpegs`;
        try {
          await this.joinParts(partPaths, joinedPath);
          await this.encodeFramesToMp4(
            joinedPath,
            stagingPath,
            this.config.timelapse.fps,
          );
        } finally {
          await rm(joinedPath, { force: true });
        }
      } else {
        // recordings / live: MJPEG parts joined then encoded.
        const joinedPath = `${stagingPath}.mjpeg`;
        try {
          await this.joinParts(partPaths, joinedPath);
          await this.encodeToMp4(
            joinedPath,
            stagingPath,
            this.config.transcoding.fps,
          );
        } finally {
          await rm(joinedPath, { force: true });
        }
      }
      return stagingPath;
    } catch (error) {
      await rm(stagingPath, { force: true });
      throw error;
    }
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

  /**
   * WAV parts are each a standalone playable RIFF/WAVE file (the firmware
   * writes every part with its own header so a part is valid on its own).
   * A real WAV's `data` chunk does not reliably start at a fixed offset --
   * encoders commonly insert a LIST/INFO chunk between `fmt ` and `data` --
   * so each part's RIFF chunk list is walked to find its actual `fmt ` and
   * `data` chunks rather than assuming a 44-byte header. The joined output
   * gets a single canonical 44-byte PCM header (from the first part's fmt
   * chunk) followed by every part's data payload concatenated, with the
   * RIFF/data chunk sizes patched to cover the full concatenated length.
   */
  private async joinWaveParts(
    partPaths: string[],
    outputPath: string,
  ): Promise<void> {
    if (partPaths.length === 0) {
      throw new InternalServerErrorException('no audio parts to join');
    }
    const first = await readFile(partPaths[0]);
    const fmtChunk = this.findRiffChunk(first, 'fmt ');
    if (!fmtChunk) {
      throw new InternalServerErrorException(
        'audio part is missing a fmt chunk',
      );
    }

    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    fmtChunk.copy(header, 20, 0, 16);
    header.write('data', 36, 'ascii');
    await writeFile(outputPath, header);

    let dataBytes = 0;
    for (const partPath of partPaths) {
      const partBuffer = await readFile(partPath);
      const dataChunk = this.findRiffChunk(partBuffer, 'data');
      if (!dataChunk) {
        throw new InternalServerErrorException(
          'audio part is missing a data chunk',
        );
      }
      await appendFile(outputPath, dataChunk);
      dataBytes += dataChunk.length;
    }

    const handle = await open(outputPath, 'r+');
    try {
      const sizes = Buffer.alloc(8);
      sizes.writeUInt32LE(36 + dataBytes, 0);
      await handle.write(sizes.subarray(0, 4), 0, 4, 4);
      sizes.writeUInt32LE(dataBytes, 4);
      await handle.write(sizes.subarray(4, 8), 0, 4, 40);
    } finally {
      await handle.close();
    }
  }

  /** Walks a RIFF file's chunk list (skipping the 12-byte RIFF/WAVE header) and returns the named chunk's payload, or undefined if absent. */
  private findRiffChunk(buffer: Buffer, chunkId: string): Buffer | undefined {
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const id = buffer.toString('ascii', offset, offset + 4);
      const size = buffer.readUInt32LE(offset + 4);
      const payloadStart = offset + 8;
      if (id === chunkId) {
        return buffer.subarray(payloadStart, payloadStart + size);
      }
      // Chunks are word-aligned: a chunk with an odd size is followed by one pad byte.
      offset = payloadStart + size + (size % 2);
    }
    return undefined;
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
          this.logger.error(
            `ffmpeg timelapse encoding failed: ${error.message}`,
          );
          reject(
            new InternalServerErrorException('failed to encode timelapse'),
          );
        })
        .on('end', () => resolvePromise())
        .save(outputPath);
    });
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
}
