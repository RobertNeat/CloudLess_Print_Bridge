import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import { KeyedLock } from '../common/keyed-lock';
import { assertIdentifier } from '../common/validation';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { MjpegCountingTransform, SizeAndHashTransform } from './stream-utils';
import type {
  AudioManifest,
  CaptureManifest,
  CompletedLive,
  CompletedLiveFile,
  LiveViewer,
  RecordingManifest,
  StoredFile,
} from './storage.types';

type TemporaryFile = {
  path: string;
  size: number;
  sha256: string;
};

type LiveViewerState = {
  stream: PassThrough;
  started: boolean;
  tail: Buffer;
};

type ActiveLive = {
  key: string;
  cameraId: string;
  requestId: string;
  resolution: string;
  temporaryPath: string;
  finalPath: string;
  startedAt: string;
  bytes: number;
  frames: number;
  contentType: string;
  boundary: Buffer;
  viewers: Set<LiveViewerState>;
};

@Injectable()
export class MediaStorageService implements OnModuleInit {
  private readonly logger = new Logger(MediaStorageService.name);
  private readonly lock = new KeyedLock();
  private readonly captureManifests = new Map<string, CaptureManifest>();
  private readonly recordingManifests = new Map<string, RecordingManifest>();
  private readonly activeLive = new Map<string, ActiveLive>();
  private readonly completedLive: CompletedLive[] = [];
  private ready = false;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: ServiceConfig) {}

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    await Promise.all(
      ['captures', 'recordings', 'live', 'audio', '.tmp'].map((directory) =>
        mkdir(join(this.config.storage.root, directory), { recursive: true }),
      ),
    );
    await this.removeStaleTemporaryFiles();
    await Promise.all([
      this.loadCaptureManifests(),
      this.loadRecordingManifests(),
    ]);
    this.ready = true;
    this.logger.log(`Media storage ready at ${this.config.storage.root}`);
  }

  async storeCapture(
    request: Request,
    cameraId: string,
    requestId: string,
    resolution: string,
    captureSequence?: number,
  ): Promise<Record<string, unknown>> {
    assertIdentifier(cameraId, 'cameraId');
    assertIdentifier(requestId, 'requestId');
    const temporary = await this.receiveRequest(
      request,
      this.config.storage.captureMaxBytes,
    );
    const key = `${cameraId}:${requestId}`;

    try {
      await this.assertJpeg(temporary.path);
      return await this.lock.run(`capture:${key}`, async () => {
        const directory = join(
          this.config.storage.root,
          'captures',
          cameraId,
          requestId,
        );
        await mkdir(directory, { recursive: true });
        const manifestPath = join(directory, 'manifest.json');
        const existing =
          this.captureManifests.get(key) ??
          (await this.readJsonIfExists<CaptureManifest>(manifestPath));
        const manifest: CaptureManifest =
          existing ??
          ({
            schemaVersion: 1,
            cameraId,
            requestId,
            resolution,
            captures: [],
          } satisfies CaptureManifest);
        if (manifest.resolution !== resolution) {
          throw new ConflictException(
            'capture resolution differs from the existing request',
          );
        }

        const highestSequence = manifest.captures.reduce(
          (maximum, item) => Math.max(maximum, item.sequence),
          -1,
        );
        const sequence = captureSequence ?? highestSequence + 1;
        if (!Number.isInteger(sequence) || sequence < 0) {
          throw new BadRequestException(
            'X-Capture-Sequence must be a non-negative integer',
          );
        }
        const fileName = `${String(sequence).padStart(6, '0')}.jpg`;
        const published = await this.publishTemporary(
          temporary,
          join(directory, fileName),
        );
        const knownEntry = manifest.captures.find(
          (item) => item.sequence === sequence,
        );
        if (
          knownEntry &&
          (knownEntry.sha256 !== published.sha256 ||
            knownEntry.size !== published.size)
        ) {
          throw new ConflictException(
            'capture sequence already contains different content',
          );
        }
        if (!knownEntry) {
          manifest.captures.push({
            sequence,
            size: published.size,
            sha256: published.sha256,
            fileName,
            storedAt: new Date().toISOString(),
          });
          manifest.captures.sort(
            (left, right) => left.sequence - right.sequence,
          );
          await this.writeJsonAtomically(manifestPath, manifest);
        }
        this.captureManifests.set(key, manifest);
        return {
          stored: true,
          duplicate: published.duplicate,
          cameraId,
          requestId,
          resolution,
          sequence,
          size: published.size,
          sha256: published.sha256,
          fileName,
        };
      });
    } finally {
      await rm(temporary.path, { force: true });
    }
  }

  async storeRecordingPart(
    request: Request,
    cameraId: string,
    requestId: string,
    partNumber: number,
    totalParts: number,
    resolution: string,
    requestedDurationSeconds: number,
    totalFrames: number,
  ): Promise<Record<string, unknown>> {
    assertIdentifier(cameraId, 'cameraId');
    assertIdentifier(requestId, 'requestId');
    if (!Number.isInteger(partNumber) || partNumber < 0) {
      throw new BadRequestException(
        'partNumber must be a non-negative integer',
      );
    }
    if (!Number.isInteger(totalParts) || totalParts <= partNumber) {
      throw new BadRequestException('X-Total-Parts is invalid');
    }
    if (
      !Number.isFinite(requestedDurationSeconds) ||
      requestedDurationSeconds < 0
    ) {
      throw new BadRequestException('X-Requested-Duration-Seconds is invalid');
    }
    if (!Number.isInteger(totalFrames) || totalFrames < 0) {
      throw new BadRequestException('X-Total-Frames is invalid');
    }

    const temporary = await this.receiveRequest(
      request,
      this.config.storage.recordingPartMaxBytes,
    );
    const key = `${cameraId}:${requestId}`;
    try {
      await this.assertMultipartStartsWithBoundary(temporary.path);
      return await this.lock.run(`recording:${key}`, async () => {
        const directory = join(
          this.config.storage.root,
          'recordings',
          cameraId,
          requestId,
        );
        await mkdir(directory, { recursive: true });
        const manifestPath = join(directory, 'manifest.json');
        const now = new Date().toISOString();
        const existing =
          this.recordingManifests.get(key) ??
          (await this.readJsonIfExists<RecordingManifest>(manifestPath));
        const manifest: RecordingManifest =
          existing ??
          ({
            schemaVersion: 1,
            cameraId,
            requestId,
            resolution,
            totalParts,
            requestedDurationSeconds,
            totalFrames,
            receivedParts: [],
            complete: false,
            createdAt: now,
            updatedAt: now,
            parts: {},
          } satisfies RecordingManifest);
        this.assertRecordingMetadata(manifest, {
          resolution,
          totalParts,
          requestedDurationSeconds,
          totalFrames,
        });

        const fileName = `part-${String(partNumber).padStart(4, '0')}.mjpeg`;
        const published = await this.publishTemporary(
          temporary,
          join(directory, fileName),
        );
        manifest.parts[String(partNumber)] = {
          partNumber,
          size: published.size,
          sha256: published.sha256,
          fileName,
          storedAt:
            manifest.parts[String(partNumber)]?.storedAt ??
            new Date().toISOString(),
        };
        manifest.receivedParts = Object.keys(manifest.parts)
          .map(Number)
          .sort((left, right) => left - right);
        manifest.complete =
          manifest.receivedParts.length === totalParts &&
          manifest.receivedParts.every((value, index) => value === index);
        manifest.updatedAt = new Date().toISOString();
        await this.writeJsonAtomically(manifestPath, manifest);
        this.recordingManifests.set(key, manifest);

        return {
          stored: true,
          duplicate: published.duplicate,
          cameraId,
          requestId,
          resolution,
          partNumber,
          totalParts,
          requestedDurationSeconds,
          totalFrames,
          size: published.size,
          sha256: published.sha256,
          recordingComplete: manifest.complete,
        };
      });
    } finally {
      await rm(temporary.path, { force: true });
    }
  }

  async storeAudio(
    request: Request,
    cameraId: string,
    requestId: string,
    durationSeconds: number,
  ): Promise<Record<string, unknown>> {
    assertIdentifier(cameraId, 'cameraId');
    assertIdentifier(requestId, 'requestId');
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new BadRequestException('X-Duration-Seconds is invalid');
    }
    const temporary = await this.receiveRequest(
      request,
      this.config.storage.audioMaxBytes,
    );
    try {
      await this.assertWave(temporary.path);
      return await this.lock.run(`audio:${cameraId}:${requestId}`, async () => {
        const directory = join(this.config.storage.root, 'audio', cameraId);
        await mkdir(directory, { recursive: true });
        const fileName = `${requestId}.wav`;
        const published = await this.publishTemporary(
          temporary,
          join(directory, fileName),
        );
        const manifestPath = join(directory, `${requestId}.manifest.json`);
        const existingManifest =
          await this.readJsonIfExists<AudioManifest>(manifestPath);
        const manifest: AudioManifest = existingManifest ?? {
          schemaVersion: 1,
          cameraId,
          requestId,
          fileName,
          durationSeconds,
          size: published.size,
          sha256: published.sha256,
          storedAt: new Date().toISOString(),
        };
        if (!existingManifest) {
          await this.writeJsonAtomically(manifestPath, manifest);
        }
        return {
          stored: true,
          duplicate: published.duplicate,
          cameraId,
          requestId,
          durationSeconds,
          size: published.size,
          sha256: published.sha256,
          fileName,
        };
      });
    } finally {
      await rm(temporary.path, { force: true });
    }
  }

  async storeLive(
    request: Request,
    cameraId: string,
    requestId: string,
    resolution: string,
    contentType: string,
  ): Promise<Record<string, unknown>> {
    assertIdentifier(cameraId, 'cameraId');
    assertIdentifier(requestId, 'requestId');
    const key = `${cameraId}:${requestId}`;
    if (this.activeLive.has(key)) {
      throw new ConflictException('live stream is already active');
    }

    const directory = join(this.config.storage.root, 'live', cameraId);
    await mkdir(directory, { recursive: true });
    const active: ActiveLive = {
      key,
      cameraId,
      requestId,
      resolution,
      temporaryPath: this.temporaryPath(),
      finalPath: join(directory, `${requestId}.mjpeg`),
      startedAt: new Date().toISOString(),
      bytes: 0,
      frames: 0,
      contentType,
      boundary: this.parseMultipartBoundary(contentType),
      viewers: new Set(),
    };
    this.activeLive.set(key, active);
    let completed = false;
    let duplicate = false;

    try {
      const counter = new MjpegCountingTransform(
        active.boundary,
        this.config.storage.liveMaxBytes,
        (bytes, frames) => {
          active.bytes = bytes;
          active.frames = frames;
        },
      );
      counter.on('data', (chunk: Buffer) =>
        this.broadcastLiveChunk(active, chunk),
      );
      await pipeline(
        request,
        counter,
        createWriteStream(active.temporaryPath, { flags: 'wx' }),
      );
      if (active.bytes === 0 || active.frames === 0) {
        throw new BadRequestException('live stream contains no MJPEG frames');
      }
      const temporary = await this.describeFile(active.temporaryPath);
      const published = await this.lock.run(`live:${key}`, () =>
        this.publishTemporary(temporary, active.finalPath),
      );
      duplicate = published.duplicate;
      completed = true;
      const finished: CompletedLive = {
        cameraId,
        requestId,
        resolution,
        filePath: active.finalPath,
        bytes: active.bytes,
        frames: active.frames,
        finishedAt: new Date().toISOString(),
      };
      this.completedLive.push(finished);
      if (this.completedLive.length > 100) {
        this.completedLive.shift();
      }
    } finally {
      this.activeLive.delete(key);
      for (const viewer of active.viewers) {
        viewer.stream.end();
      }
      active.viewers.clear();
      await rm(active.temporaryPath, { force: true });
    }

    return {
      stored: completed,
      duplicate,
      cameraId,
      requestId,
      resolution,
      bytes: active.bytes,
      frames: active.frames,
    };
  }

  openLiveViewer(cameraId: string, requestId?: string): LiveViewer {
    assertIdentifier(cameraId, 'cameraId');
    if (requestId !== undefined) {
      assertIdentifier(requestId, 'requestId');
    }
    const active = [...this.activeLive.values()].find(
      (item) =>
        item.cameraId === cameraId &&
        (requestId === undefined || item.requestId === requestId),
    );
    if (!active) {
      throw new NotFoundException('no matching live stream is active');
    }

    const stream = new PassThrough({
      highWaterMark: this.config.storage.liveViewerBufferBytes,
    });
    const viewer: LiveViewerState = {
      stream,
      started: false,
      tail: Buffer.alloc(0),
    };
    active.viewers.add(viewer);
    const remove = () => active.viewers.delete(viewer);
    stream.once('close', remove);
    stream.once('error', remove);
    return {
      stream,
      contentType: active.contentType,
      requestId: active.requestId,
    };
  }

  getStatus(): Record<string, unknown> {
    return {
      ready: this.ready,
      storageRoot: this.config.storage.root,
      captureRequestCount: this.captureManifests.size,
      recordingCount: this.recordingManifests.size,
      completedRecordingCount: [...this.recordingManifests.values()].filter(
        (manifest) => manifest.complete,
      ).length,
      activeLive: [...this.activeLive.values()].map((item) => ({
        cameraId: item.cameraId,
        requestId: item.requestId,
        resolution: item.resolution,
        startedAt: item.startedAt,
        bytes: item.bytes,
        frames: item.frames,
        viewers: item.viewers.size,
      })),
      recentlyCompletedLive: this.completedLive,
    };
  }

  listRecordingManifests(): RecordingManifest[] {
    return [...this.recordingManifests.values()];
  }

  listCaptureManifests(): CaptureManifest[] {
    return [...this.captureManifests.values()];
  }

  async listCompletedLiveRecordings(): Promise<CompletedLiveFile[]> {
    const root = join(this.config.storage.root, 'live');
    const results: CompletedLiveFile[] = [];
    for (const cameraId of await this.directories(root)) {
      const files = await readdir(join(root, cameraId)).catch(() => []);
      for (const file of files) {
        if (!file.endsWith('.mjpeg')) continue;
        const filePath = join(root, cameraId, file);
        const info = await stat(filePath);
        results.push({
          cameraId,
          requestId: file.slice(0, -'.mjpeg'.length),
          fileName: file,
          size: info.size,
          finishedAt: info.mtime.toISOString(),
        });
      }
    }
    return results;
  }

  liveRecordingFilePath(cameraId: string, requestId: string): string {
    return join(
      this.config.storage.root,
      'live',
      cameraId,
      `${requestId}.mjpeg`,
    );
  }

  async listAudioManifests(): Promise<AudioManifest[]> {
    const root = join(this.config.storage.root, 'audio');
    const manifests: AudioManifest[] = [];
    for (const cameraId of await this.directories(root)) {
      const files = await readdir(join(root, cameraId)).catch(() => []);
      for (const file of files) {
        if (!file.endsWith('.manifest.json')) continue;
        const manifest = await this.readJsonIfExists<AudioManifest>(
          join(root, cameraId, file),
        );
        if (manifest?.schemaVersion === 1) {
          manifests.push(manifest);
        }
      }
    }
    return manifests;
  }

  recordingPartPaths(cameraId: string, requestId: string): string[] {
    const manifest = this.recordingManifests.get(`${cameraId}:${requestId}`);
    if (!manifest?.complete) {
      throw new NotFoundException('recording was not found');
    }
    const directory = join(
      this.config.storage.root,
      'recordings',
      cameraId,
      requestId,
    );
    return manifest.receivedParts.map((partNumber) =>
      join(directory, manifest.parts[String(partNumber)].fileName),
    );
  }

  captureFilePath(
    cameraId: string,
    requestId: string,
    fileName: string,
  ): string {
    return join(
      this.config.storage.root,
      'captures',
      cameraId,
      requestId,
      fileName,
    );
  }

  audioFilePath(cameraId: string, fileName: string): string {
    return join(this.config.storage.root, 'audio', cameraId, fileName);
  }

  recordingThumbnailPath(cameraId: string, requestId: string): string {
    const manifest = this.recordingManifests.get(`${cameraId}:${requestId}`);
    if (manifest) {
      return join(
        this.config.storage.root,
        'recordings',
        cameraId,
        requestId,
        'thumbnail.jpg',
      );
    }
    return join(
      this.config.storage.root,
      'live',
      cameraId,
      `${requestId}.thumb.jpg`,
    );
  }

  captureThumbnailPath(cameraId: string, requestId: string): string {
    return join(
      this.config.storage.root,
      'captures',
      cameraId,
      requestId,
      'thumbnail.jpg',
    );
  }

  audioThumbnailPath(cameraId: string, requestId: string): string {
    return join(
      this.config.storage.root,
      'audio',
      cameraId,
      `${requestId}.thumb.png`,
    );
  }

  async deleteRecording(cameraId: string, requestId: string): Promise<void> {
    const key = `${cameraId}:${requestId}`;
    if (this.recordingManifests.has(key)) {
      this.recordingManifests.delete(key);
      await rm(
        join(this.config.storage.root, 'recordings', cameraId, requestId),
        {
          recursive: true,
          force: true,
        },
      );
      return;
    }
    const filePath = this.liveRecordingFilePath(cameraId, requestId);
    if (!(await this.exists(filePath))) {
      throw new NotFoundException('recording was not found');
    }
    const directory = join(this.config.storage.root, 'live', cameraId);
    await Promise.all([
      rm(filePath, { force: true }),
      rm(join(directory, `${requestId}.mp4`), { force: true }),
      rm(join(directory, `${requestId}.thumb.jpg`), { force: true }),
    ]);
  }

  async deleteCapture(cameraId: string, requestId: string): Promise<void> {
    const key = `${cameraId}:${requestId}`;
    if (!this.captureManifests.has(key)) {
      throw new NotFoundException('capture was not found');
    }
    this.captureManifests.delete(key);
    await rm(join(this.config.storage.root, 'captures', cameraId, requestId), {
      recursive: true,
      force: true,
    });
  }

  async deleteAudio(cameraId: string, requestId: string): Promise<void> {
    const directory = join(this.config.storage.root, 'audio', cameraId);
    const filePath = join(directory, `${requestId}.wav`);
    const manifestPath = join(directory, `${requestId}.manifest.json`);
    if (!(await this.exists(filePath)) && !(await this.exists(manifestPath))) {
      throw new NotFoundException('audio recording was not found');
    }
    await Promise.all([
      rm(filePath, { force: true }),
      rm(manifestPath, { force: true }),
      rm(join(directory, `${requestId}.thumb.png`), { force: true }),
    ]);
  }

  async renameRecording(
    cameraId: string,
    requestId: string,
    displayName: string,
  ): Promise<void> {
    const key = `${cameraId}:${requestId}`;
    const manifest = this.recordingManifests.get(key);
    if (!manifest) {
      throw new NotFoundException('recording was not found');
    }
    manifest.displayName = displayName;
    await this.writeJsonAtomically(
      join(
        this.config.storage.root,
        'recordings',
        cameraId,
        requestId,
        'manifest.json',
      ),
      manifest,
    );
  }

  async renameCapture(
    cameraId: string,
    requestId: string,
    displayName: string,
  ): Promise<void> {
    const key = `${cameraId}:${requestId}`;
    const manifest = this.captureManifests.get(key);
    if (!manifest) {
      throw new NotFoundException('capture was not found');
    }
    manifest.displayName = displayName;
    await this.writeJsonAtomically(
      join(
        this.config.storage.root,
        'captures',
        cameraId,
        requestId,
        'manifest.json',
      ),
      manifest,
    );
  }

  async renameAudio(
    cameraId: string,
    requestId: string,
    displayName: string,
  ): Promise<void> {
    const manifestPath = join(
      this.config.storage.root,
      'audio',
      cameraId,
      `${requestId}.manifest.json`,
    );
    const manifest = await this.readJsonIfExists<AudioManifest>(manifestPath);
    if (!manifest) {
      throw new NotFoundException('audio recording was not found');
    }
    manifest.displayName = displayName;
    await this.writeJsonAtomically(manifestPath, manifest);
  }

  private async receiveRequest(
    request: Request,
    maximumBytes: number,
  ): Promise<TemporaryFile> {
    const temporaryPath = this.temporaryPath();
    const hash = createHash('sha256');
    let size = 0;
    const meter = new SizeAndHashTransform(maximumBytes, (chunk) => {
      size += chunk.length;
      hash.update(chunk);
    });
    try {
      await pipeline(
        request,
        meter,
        createWriteStream(temporaryPath, { flags: 'wx' }),
      );
      if (size === 0) {
        throw new BadRequestException('upload body must not be empty');
      }
      return { path: temporaryPath, size, sha256: hash.digest('hex') };
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  private async publishTemporary(
    temporary: TemporaryFile,
    finalPath: string,
  ): Promise<StoredFile> {
    if (await this.exists(finalPath)) {
      const existing = await this.describeFile(finalPath);
      if (
        existing.size !== temporary.size ||
        existing.sha256 !== temporary.sha256
      ) {
        throw new ConflictException('existing file has different content');
      }
      return {
        size: temporary.size,
        sha256: temporary.sha256,
        duplicate: true,
      };
    }
    await rename(temporary.path, finalPath);
    return {
      size: temporary.size,
      sha256: temporary.sha256,
      duplicate: false,
    };
  }

  private async describeFile(filePath: string): Promise<TemporaryFile> {
    const hash = createHash('sha256');
    let size = 0;
    const input: ReadStream = createReadStream(filePath);
    for await (const chunk of input) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      hash.update(buffer);
    }
    return { path: filePath, size, sha256: hash.digest('hex') };
  }

  private assertRecordingMetadata(
    manifest: RecordingManifest,
    metadata: Pick<
      RecordingManifest,
      'resolution' | 'totalParts' | 'requestedDurationSeconds' | 'totalFrames'
    >,
  ): void {
    if (
      manifest.resolution !== metadata.resolution ||
      manifest.totalParts !== metadata.totalParts ||
      manifest.requestedDurationSeconds !== metadata.requestedDurationSeconds ||
      manifest.totalFrames !== metadata.totalFrames
    ) {
      throw new ConflictException(
        'recording metadata differs from the manifest',
      );
    }
  }

  private broadcastLiveChunk(active: ActiveLive, chunk: Buffer): void {
    for (const viewer of active.viewers) {
      let output = chunk;
      if (!viewer.started) {
        const searchable = Buffer.concat([viewer.tail, chunk]);
        const boundaryOffset = searchable.indexOf(active.boundary);
        if (boundaryOffset < 0) {
          const tailLength = Math.min(
            active.boundary.length - 1,
            searchable.length,
          );
          viewer.tail = searchable.subarray(searchable.length - tailLength);
          continue;
        }
        viewer.started = true;
        viewer.tail = Buffer.alloc(0);
        output = searchable.subarray(boundaryOffset);
      }
      viewer.stream.write(output);
      if (
        viewer.stream.writableLength > this.config.storage.liveViewerBufferBytes
      ) {
        active.viewers.delete(viewer);
        viewer.stream.destroy(new Error('live viewer is too slow'));
      }
    }
  }

  private parseMultipartBoundary(contentType: string): Buffer {
    const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(
      contentType,
    );
    const boundary = match?.[1] ?? match?.[2];
    if (!boundary || boundary.length > 70) {
      throw new BadRequestException('a valid multipart boundary is required');
    }
    return Buffer.from(`--${boundary}`);
  }

  private async assertJpeg(filePath: string): Promise<void> {
    const content = await readFile(filePath);
    if (
      content.length < 4 ||
      content[0] !== 0xff ||
      content[1] !== 0xd8 ||
      content.at(-2) !== 0xff ||
      content.at(-1) !== 0xd9
    ) {
      throw new BadRequestException('upload is not a complete JPEG file');
    }
  }

  private async assertWave(filePath: string): Promise<void> {
    const handle = await open(filePath, 'r');
    try {
      const header = Buffer.alloc(12);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (
        bytesRead !== 12 ||
        header.toString('ascii', 0, 4) !== 'RIFF' ||
        header.toString('ascii', 8, 12) !== 'WAVE'
      ) {
        throw new BadRequestException('upload is not a WAV file');
      }
    } finally {
      await handle.close();
    }
  }

  private async assertMultipartStartsWithBoundary(
    filePath: string,
  ): Promise<void> {
    const handle = await open(filePath, 'r');
    try {
      const prefix = Buffer.alloc(2);
      const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
      if (bytesRead !== 2 || prefix.toString('ascii') !== '--') {
        throw new BadRequestException(
          'recording part is not an MJPEG multipart body',
        );
      }
    } finally {
      await handle.close();
    }
  }

  private async loadCaptureManifests(): Promise<void> {
    const root = join(this.config.storage.root, 'captures');
    for (const camera of await this.directories(root)) {
      for (const requestId of await this.directories(join(root, camera))) {
        const manifest = await this.readJsonIfExists<CaptureManifest>(
          join(root, camera, requestId, 'manifest.json'),
        );
        if (manifest?.schemaVersion === 1) {
          this.captureManifests.set(`${camera}:${requestId}`, manifest);
        }
      }
    }
  }

  private async loadRecordingManifests(): Promise<void> {
    const root = join(this.config.storage.root, 'recordings');
    for (const camera of await this.directories(root)) {
      for (const requestId of await this.directories(join(root, camera))) {
        const manifest = await this.readJsonIfExists<RecordingManifest>(
          join(root, camera, requestId, 'manifest.json'),
        );
        if (manifest?.schemaVersion === 1) {
          this.recordingManifests.set(`${camera}:${requestId}`, manifest);
        }
      }
    }
  }

  private async directories(path: string): Promise<string[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  private async readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw new Error(`Cannot read storage manifest ${filePath}`, {
        cause: error,
      });
    }
  }

  private async writeJsonAtomically(
    filePath: string,
    value: unknown,
  ): Promise<void> {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(value, null, 2)}\n`,
        'utf8',
      );
      await rename(temporaryPath, filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private async removeStaleTemporaryFiles(): Promise<void> {
    const directory = join(this.config.storage.root, '.tmp');
    const files = await readdir(directory);
    await Promise.all(
      files.map((file) => rm(join(directory, file), { force: true })),
    );
  }

  private temporaryPath(): string {
    return join(this.config.storage.root, '.tmp', `${randomUUID()}.upload`);
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }
}
