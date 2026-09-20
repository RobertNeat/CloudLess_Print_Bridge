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
import {
  createReadStream,
  createWriteStream,
  type Dirent,
  type ReadStream,
} from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import { CameraRegistryService } from '../camera-registry/camera-registry.service';
import { KeyedLock } from '../common/keyed-lock';
import { assertIdentifier } from '../common/validation';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import {
  buildFinalFileName,
  buildPartFileName,
  resolveCameraNaming,
} from './resource-naming';
import { MjpegCountingTransform, SizeAndHashTransform } from './stream-utils';
import type {
  AudioThumbnailVariant,
  LiveViewer,
  MediaResourceKind,
  ManifestPart,
  ResourceManifest,
  ResourceMetadata,
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
  finalDirectory: string;
  startedAt: string;
  bytes: number;
  frames: number;
  contentType: string;
  boundary: Buffer;
  viewers: Set<LiveViewerState>;
};

const resourceKinds: MediaResourceKind[] = [
  'captures',
  'timelapses',
  'recordings',
  'audio',
  'live',
];

@Injectable()
export class MediaStorageService implements OnModuleInit {
  private readonly logger = new Logger(MediaStorageService.name);
  private readonly lock = new KeyedLock();
  /** Keyed by `${kind}:${cameraId}:${requestId}`. */
  private readonly manifests = new Map<string, ResourceManifest>();
  private readonly metadata = new Map<string, ResourceMetadata>();
  private readonly activeLive = new Map<string, ActiveLive>();
  /**
   * Keyed by `${cameraId}:${requestId}`. Set by CameraCommandService when
   * dispatching start-live/start-dynamic-live (persist defaults to true,
   * preserving existing behavior for every caller that doesn't opt out —
   * e.g. the Videos page). storeLive() consults this when the camera later
   * POSTs its MJPEG frames back, to decide whether to persist to disk at
   * all. Cleared on stop-live and once the live session completes, so a
   * stale entry can never leak into an unrelated later requestId.
   */
  private readonly livePersistIntent = new Map<string, boolean>();
  private ready = false;

  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
    private readonly cameraRegistry: CameraRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    await Promise.all(
      [...resourceKinds, '.tmp'].map((directory) =>
        mkdir(join(this.config.storage.root, directory), { recursive: true }),
      ),
    );
    await this.removeStaleTemporaryFiles();
    await this.loadAllManifestsAndMetadata();
    this.ready = true;
    this.logger.log(`Media storage ready at ${this.config.storage.root}`);
  }

  maxBytesForKind(kind: MediaResourceKind): number {
    switch (kind) {
      case 'captures':
        return this.config.storage.captureMaxBytes;
      case 'timelapses':
        return this.config.storage.timelapsePartMaxBytes;
      case 'recordings':
        return this.config.storage.recordingPartMaxBytes;
      case 'audio':
        return this.config.storage.audioPartMaxBytes;
      case 'live':
        return this.config.storage.liveMaxBytes;
    }
  }

  /** Stores one part (or, for captures, the single file) of a resource. Returns storage result plus manifest completeness. */
  async storePart(
    request: Request,
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
    options: {
      partNumber: number;
      totalParts: number;
      resolution?: string;
      durationSeconds?: number;
      totalFrames?: number;
      expectedSha256?: string;
    },
  ): Promise<Record<string, unknown>> {
    assertIdentifier(cameraId, 'cameraId');
    assertIdentifier(requestId, 'requestId');
    const { partNumber, totalParts } = options;
    if (!Number.isInteger(partNumber) || partNumber < 0) {
      throw new BadRequestException(
        'partNumber must be a non-negative integer',
      );
    }
    if (!Number.isInteger(totalParts) || totalParts <= partNumber) {
      throw new BadRequestException('totalParts is invalid');
    }

    const temporary = await this.receiveRequest(
      request,
      this.maxBytesForKind(kind),
    );
    if (
      options.expectedSha256 !== undefined &&
      options.expectedSha256.toLowerCase() !== temporary.sha256
    ) {
      await rm(temporary.path, { force: true });
      throw new BadRequestException(
        'X-Sha256 does not match the received content',
      );
    }
    const key = this.key(kind, cameraId, requestId);
    try {
      return await this.lock.run(key, async () => {
        const directory = this.resourceDirectory(kind, cameraId, requestId);
        await mkdir(directory, { recursive: true });
        const manifestPath = join(directory, 'manifest.json');
        const now = new Date().toISOString();
        const existing =
          this.manifests.get(key) ??
          (await this.readJsonIfExists<ResourceManifest>(manifestPath));
        const manifest: ResourceManifest =
          existing ??
          ({
            schemaVersion: 1,
            kind,
            cameraId,
            requestId,
            totalParts,
            receivedParts: [],
            complete: false,
            parts: {},
            resolution: options.resolution,
            durationSeconds: options.durationSeconds,
            totalFrames: options.totalFrames,
            createdAt: now,
            updatedAt: now,
          } satisfies ResourceManifest);

        this.assertManifestMetadataMatches(manifest, options);

        const fileName = buildPartFileName(kind, partNumber);
        const published = await this.publishTemporary(
          temporary,
          join(directory, fileName),
        );
        const part: ManifestPart = {
          partNumber,
          size: published.size,
          sha256: published.sha256,
          fileName,
          storedAt: manifest.parts[String(partNumber)]?.storedAt ?? now,
        };
        manifest.parts[String(partNumber)] = part;
        manifest.receivedParts = Object.keys(manifest.parts)
          .map(Number)
          .sort((left, right) => left - right);
        manifest.complete =
          manifest.receivedParts.length === totalParts &&
          manifest.receivedParts.every((value, index) => value === index);
        manifest.updatedAt = new Date().toISOString();
        await this.writeJsonAtomically(manifestPath, manifest);
        this.manifests.set(key, manifest);

        return {
          stored: true,
          duplicate: published.duplicate,
          cameraId,
          requestId,
          partNumber,
          totalParts,
          size: published.size,
          sha256: published.sha256,
          complete: manifest.complete,
        };
      });
    } finally {
      await rm(temporary.path, { force: true });
    }
  }

  /** Convenience wrapper for captures: always a single part (partNumber 0, totalParts 1). */
  async storeCapture(
    request: Request,
    cameraId: string,
    requestId: string,
    resolution: string,
    expectedSha256?: string,
  ): Promise<Record<string, unknown>> {
    return this.storePart(request, 'captures', cameraId, requestId, {
      partNumber: 0,
      totalParts: 1,
      resolution,
      expectedSha256,
    });
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
    const key = this.key('live', cameraId, requestId);
    if (this.activeLive.has(key)) {
      throw new ConflictException('live stream is already active');
    }
    // Defaults to true (unset intent = every caller that predates this
    // opt-out, and every caller that never sets `persist: false` on
    // start-live) so existing behavior — e.g. the Videos page's recordings
    // library — is unaffected.
    const persist = this.livePersistIntent.get(this.persistIntentKey(cameraId, requestId)) ?? true;

    const directory = this.resourceDirectory('live', cameraId, requestId);
    if (persist) {
      await mkdir(directory, { recursive: true });
    }
    const active: ActiveLive = {
      key,
      cameraId,
      requestId,
      resolution,
      temporaryPath: this.temporaryPath(),
      finalDirectory: directory,
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
      // maxBytesForKind('live') (1 GiB by default) exists to bound how much
      // a single session writes to disk. When persist is false nothing
      // reaches disk at all (see the sink swap below), so that bound has
      // nothing left to protect — capping it here would just make an
      // unrelated resource (RAM/network on a long-running in-memory-only
      // broadcast) fail at an arbitrary, content-dependent byte count
      // instead of running for as long as the viewer wants it to.
      const counter = new MjpegCountingTransform(
        active.boundary,
        persist ? this.maxBytesForKind('live') : Number.POSITIVE_INFINITY,
        (bytes, frames) => {
          active.bytes = bytes;
          active.frames = frames;
        },
      );
      counter.on('data', (chunk: Buffer) =>
        this.broadcastLiveChunk(active, chunk),
      );
      // Viewers are served from the in-memory broadcast (broadcastLiveChunk),
      // not from this sink — when persist is false, nothing needs to reach
      // disk at all, so pipeline's destination is a no-op Writable instead
      // of a temp file. This makes persist:false genuinely stream-only, not
      // write-then-discard: no bytes ever touch storage.
      const sink = persist
        ? createWriteStream(active.temporaryPath, { flags: 'wx' })
        : new Writable({
            write(_chunk, _encoding, callback) {
              callback();
            },
          });
      await pipeline(request, counter, sink);
      if (active.bytes === 0 || active.frames === 0) {
        throw new BadRequestException('live stream contains no MJPEG frames');
      }
      if (persist) {
        const temporary = await this.describeFile(active.temporaryPath);
        const fileName = buildPartFileName('live', 0);
        const published = await this.lock.run(key, () =>
          this.publishTemporary(temporary, join(directory, fileName)),
        );
        duplicate = published.duplicate;
        completed = true;

        const now = new Date().toISOString();
        const manifest: ResourceManifest = {
          schemaVersion: 1,
          kind: 'live',
          cameraId,
          requestId,
          totalParts: 1,
          receivedParts: [0],
          complete: true,
          parts: {
            '0': {
              partNumber: 0,
              size: published.size,
              sha256: published.sha256,
              fileName,
              storedAt: now,
            },
          },
          resolution,
          totalFrames: active.frames,
          createdAt: active.startedAt,
          updatedAt: now,
        };
        await this.writeJsonAtomically(
          join(directory, 'manifest.json'),
          manifest,
        );
        this.manifests.set(key, manifest);
      }
    } finally {
      this.activeLive.delete(key);
      this.livePersistIntent.delete(this.persistIntentKey(cameraId, requestId));
      for (const viewer of active.viewers) {
        viewer.stream.end();
      }
      active.viewers.clear();
      // Only persist:true ever created a temporary file to clean up.
      if (persist) {
        await rm(active.temporaryPath, { force: true });
      }
    }

    return {
      stored: completed,
      duplicate,
      persist,
      cameraId,
      requestId,
      resolution,
      bytes: active.bytes,
      frames: active.frames,
      complete: completed,
    };
  }

  /** Called by CameraCommandService when dispatching start-live/start-dynamic-live. See livePersistIntent's doc comment. */
  setLivePersistIntent(cameraId: string, requestId: string, persist: boolean): void {
    assertIdentifier(cameraId, 'cameraId');
    assertIdentifier(requestId, 'requestId');
    this.livePersistIntent.set(this.persistIntentKey(cameraId, requestId), persist);
  }

  /** Called by CameraCommandService when dispatching stop-live, so an intent never outlives the session it was set for if the camera never POSTs back (e.g. it failed to start). */
  clearLivePersistIntent(cameraId: string, requestId: string): void {
    this.livePersistIntent.delete(this.persistIntentKey(cameraId, requestId));
  }

  private persistIntentKey(cameraId: string, requestId: string): string {
    return `${cameraId}:${requestId}`;
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
    const allManifests = [...this.manifests.values()];
    return {
      ready: this.ready,
      storageRoot: this.config.storage.root,
      manifestCount: allManifests.length,
      completeCount: allManifests.filter((manifest) => manifest.complete)
        .length,
      metadataCount: this.metadata.size,
      activeLive: [...this.activeLive.values()].map((item) => ({
        cameraId: item.cameraId,
        requestId: item.requestId,
        resolution: item.resolution,
        startedAt: item.startedAt,
        bytes: item.bytes,
        frames: item.frames,
        viewers: item.viewers.size,
      })),
    };
  }

  listManifests(kind: MediaResourceKind): ResourceManifest[] {
    return [...this.manifests.values()].filter(
      (manifest) => manifest.kind === kind,
    );
  }

  listMetadata(kind: MediaResourceKind): ResourceMetadata[] {
    return [...this.metadata.values()].filter((entry) => entry.kind === kind);
  }

  getManifest(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): ResourceManifest | undefined {
    return this.manifests.get(this.key(kind, cameraId, requestId));
  }

  getMetadata(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): ResourceMetadata | undefined {
    return this.metadata.get(this.key(kind, cameraId, requestId));
  }

  partPaths(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): string[] {
    const manifest = this.manifests.get(this.key(kind, cameraId, requestId));
    if (!manifest?.complete) {
      throw new NotFoundException(
        'resource was not found or is not complete yet',
      );
    }
    const directory = this.resourceDirectory(kind, cameraId, requestId);
    return manifest.receivedParts.map((partNumber) =>
      join(directory, manifest.parts[String(partNumber)].fileName),
    );
  }

  resourceDirectory(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): string {
    return join(this.config.storage.root, kind, cameraId, requestId);
  }

  finalFilePath(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): string {
    const metadata = this.metadata.get(this.key(kind, cameraId, requestId));
    if (!metadata) {
      throw new NotFoundException('resource is not finished yet');
    }
    return join(
      this.resourceDirectory(kind, cameraId, requestId),
      metadata.fileName,
    );
  }

  thumbnailPath(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): string {
    return join(
      this.resourceDirectory(kind, cameraId, requestId),
      'thumbnail.jpg',
    );
  }

  audioThumbnailPath(
    cameraId: string,
    requestId: string,
    variant: AudioThumbnailVariant,
  ): string {
    return join(
      this.resourceDirectory('audio', cameraId, requestId),
      `thumbnail_${variant}.jpg`,
    );
  }

  /**
   * Finalizes a resource once its last part (or transcoded output) is ready:
   * resolves the camera's display name/IP, renames the finished file to the
   * spec's naming scheme, deletes the numbered parts and manifest.json, and
   * writes metadata.json. `producedFilePath` is the transcoded MP4/joined WAV
   * (or, for captures, the single already-stored image) to move into place.
   */
  async finalizeResource(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
    producedFilePath: string,
  ): Promise<ResourceMetadata> {
    const key = this.key(kind, cameraId, requestId);
    return this.lock.run(`${key}:finalize`, async () => {
      const manifest = this.manifests.get(key);
      if (!manifest?.complete) {
        throw new NotFoundException('resource is not complete yet');
      }
      const directory = this.resourceDirectory(kind, cameraId, requestId);
      const naming = resolveCameraNaming(
        cameraId,
        this.cameraRegistry.tryGet(cameraId),
      );
      const fileName = buildFinalFileName(kind, naming);
      const finalPath = join(directory, fileName);

      const described = await this.describeFile(producedFilePath);
      if (producedFilePath !== finalPath) {
        await rename(producedFilePath, finalPath);
      }

      const partPaths = manifest.receivedParts
        .map((partNumber) =>
          join(directory, manifest.parts[String(partNumber)].fileName),
        )
        .filter((path) => path !== finalPath);
      await Promise.all(partPaths.map((path) => rm(path, { force: true })));

      const now = new Date().toISOString();
      const metadata: ResourceMetadata = {
        schemaVersion: 1,
        kind,
        cameraId,
        requestId,
        fileName,
        cameraName: naming.name,
        cameraIp: naming.ip,
        resolution: manifest.resolution,
        durationSeconds: manifest.durationSeconds,
        totalFrames: manifest.totalFrames,
        size: described.size,
        sha256: described.sha256,
        createdAt: manifest.createdAt,
        completedAt: now,
        displayName: manifest.displayName,
      };
      await this.writeJsonAtomically(
        join(directory, 'metadata.json'),
        metadata,
      );
      await rm(join(directory, 'manifest.json'), { force: true });
      this.metadata.set(key, metadata);
      this.manifests.delete(key);
      return metadata;
    });
  }

  async deleteResource(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): Promise<void> {
    const key = this.key(kind, cameraId, requestId);
    if (!this.manifests.has(key) && !this.metadata.has(key)) {
      throw new NotFoundException('resource was not found');
    }
    this.manifests.delete(key);
    this.metadata.delete(key);
    await rm(this.resourceDirectory(kind, cameraId, requestId), {
      recursive: true,
      force: true,
    });
  }

  async renameResource(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
    displayName: string,
  ): Promise<void> {
    const key = this.key(kind, cameraId, requestId);
    const directory = this.resourceDirectory(kind, cameraId, requestId);
    const metadata = this.metadata.get(key);
    if (metadata) {
      metadata.displayName = displayName;
      await this.writeJsonAtomically(
        join(directory, 'metadata.json'),
        metadata,
      );
      return;
    }
    const manifest = this.manifests.get(key);
    if (!manifest) {
      throw new NotFoundException('resource was not found');
    }
    manifest.displayName = displayName;
    await this.writeJsonAtomically(join(directory, 'manifest.json'), manifest);
  }

  private key(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): string {
    return `${kind}:${cameraId}:${requestId}`;
  }

  private assertManifestMetadataMatches(
    manifest: ResourceManifest,
    options: {
      totalParts: number;
      resolution?: string;
      durationSeconds?: number;
      totalFrames?: number;
    },
  ): void {
    if (
      manifest.totalParts !== options.totalParts ||
      (options.resolution !== undefined &&
        manifest.resolution !== options.resolution) ||
      (options.durationSeconds !== undefined &&
        manifest.durationSeconds !== options.durationSeconds) ||
      (options.totalFrames !== undefined &&
        manifest.totalFrames !== options.totalFrames)
    ) {
      throw new ConflictException(
        'resource metadata differs from the existing manifest',
      );
    }
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
    return { size: temporary.size, sha256: temporary.sha256, duplicate: false };
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

  private async loadAllManifestsAndMetadata(): Promise<void> {
    for (const kind of resourceKinds) {
      const root = join(this.config.storage.root, kind);
      for (const cameraId of await this.directories(root)) {
        for (const requestId of await this.directories(join(root, cameraId))) {
          const directory = join(root, cameraId, requestId);
          const key = this.key(kind, cameraId, requestId);
          const manifest = await this.readJsonIfExists<ResourceManifest>(
            join(directory, 'manifest.json'),
          );
          if (manifest?.schemaVersion === 1) {
            this.manifests.set(key, manifest);
          }
          const metadata = await this.readJsonIfExists<ResourceMetadata>(
            join(directory, 'metadata.json'),
          );
          if (metadata?.schemaVersion === 1) {
            this.metadata.set(key, metadata);
          }
        }
      }
    }
  }

  private async directories(path: string): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return [];
    }
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
      throw new Error(`Cannot read storage file ${filePath}`, { cause: error });
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
    const files = await readdir(directory).catch(() => []);
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
