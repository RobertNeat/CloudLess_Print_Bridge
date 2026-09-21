import { createHash } from 'node:crypto';
import type { AppConfig } from '../config/app-config';
import { FtpsSessionService } from '../ftps/ftps-session.service';
import type {
  RemoteStorageClient,
  RemoteStorageEntry,
} from '../ftps/remote-storage.client';
import type { RemoteStorageOperation } from '../ftps/remote-storage.errors';
import { PrintJobThumbnailService } from './print-job-thumbnail.service';

function config(): AppConfig {
  return {
    printJobThumbnail: {
      gcodeDirectory: './cache/',
      md5IndexDirectory: './image/md5/',
      imageDirectory: './image/',
      indexRefreshIntervalMs: 30_000,
    },
  } as AppConfig;
}

/** Minimal in-memory RemoteStorageClient double: files keyed by remote path. */
class FakeRemoteStorageClient implements RemoteStorageClient {
  listCalls: string[] = [];
  downloadCalls: string[] = [];

  constructor(
    private readonly directories: Record<string, RemoteStorageEntry[]>,
    private readonly files: Record<string, Buffer>,
  ) {}

  setDirectory(path: string, entries: RemoteStorageEntry[]): void {
    this.directories[path] = entries;
  }

  setFile(remotePath: string, content: Buffer): void {
    this.files[remotePath] = content;
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  list(path: string): Promise<RemoteStorageEntry[]> {
    this.listCalls.push(path);
    return Promise.resolve(this.directories[path] ?? []);
  }

  async download(
    destination: NodeJS.WritableStream,
    remotePath: string,
  ): Promise<void> {
    this.downloadCalls.push(remotePath);
    const content = this.files[remotePath];
    if (!content) throw new Error(`not found: ${remotePath}`);
    destination.end(content);
    await new Promise<void>((resolve) => destination.once('finish', resolve));
  }

  upload(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  deleteFile(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  move(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  createDirectory(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  deleteDirectory(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  close(): void {}
}

function fakeSessions(client: FakeRemoteStorageClient): FtpsSessionService {
  return {
    execute: <T>(
      _operation: RemoteStorageOperation,
      operation: (client: RemoteStorageClient) => Promise<T>,
    ) => operation(client),
  } as unknown as FtpsSessionService;
}

function entry(name: string, size = 1): RemoteStorageEntry {
  return { name, type: 'file', size };
}

describe('PrintJobThumbnailService', () => {
  it('resolves a thumbnail id by matching the job gcode digest against the md5 index', async () => {
    const gcodeContent = Buffer.from('G28\nG1 X10\n');
    const digest = createHash('md5')
      .update(gcodeContent)
      .digest('hex')
      .toUpperCase();

    const client = new FakeRemoteStorageClient(
      {
        './cache/': [entry('Cute_Bunny_13_MIN_Test_Print.gcode')],
        './image/md5/': [entry('18047668811.md5')],
      },
      {
        './cache/Cute_Bunny_13_MIN_Test_Print.gcode': gcodeContent,
        './image/md5/18047668811.md5': Buffer.from(digest),
      },
    );
    const service = new PrintJobThumbnailService(
      config(),
      fakeSessions(client),
    );

    const id = await service.resolveThumbnailId(
      'Cute_Bunny_13_MIN_Test_Print.gcode.3mf',
    );

    expect(id).toBe('18047668811');
  });

  it('picks the first gcode by name for a multi-plate job, deterministically', async () => {
    const gcodeContent = Buffer.from('plate 1 content');
    const digest = createHash('md5')
      .update(gcodeContent)
      .digest('hex')
      .toUpperCase();

    const client = new FakeRemoteStorageClient(
      {
        './cache/': [entry('Vase_plate_2.gcode'), entry('Vase_plate_1.gcode')],
        './image/md5/': [entry('99.md5')],
      },
      {
        './cache/Vase_plate_1.gcode': gcodeContent,
        './cache/Vase_plate_2.gcode': Buffer.from('plate 2 content'),
        './image/md5/99.md5': Buffer.from(digest),
      },
    );
    const service = new PrintJobThumbnailService(
      config(),
      fakeSessions(client),
    );

    const id = await service.resolveThumbnailId('Vase.gcode.3mf');

    expect(id).toBe('99');
    expect(client.downloadCalls).toContain('./cache/Vase_plate_1.gcode');
    expect(client.downloadCalls).not.toContain('./cache/Vase_plate_2.gcode');
  });

  it('returns undefined and caches the negative result when no gcode matches, given a populated index', async () => {
    // A non-empty index is required for the negative result to be cached at
    // all — see the "never permanently caches a negative result while the
    // md5 index is still empty" test below for why.
    const client = new FakeRemoteStorageClient(
      { './cache/': [], './image/md5/': [entry('1.md5')] },
      { './image/md5/1.md5': Buffer.from('AAAA') },
    );
    const service = new PrintJobThumbnailService(
      config(),
      fakeSessions(client),
    );

    const first = await service.resolveThumbnailId('Unknown_Job.gcode.3mf');
    const second = await service.resolveThumbnailId('Unknown_Job.gcode.3mf');

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    // Cached: the second call must not re-list the gcode directory.
    expect(client.listCalls.filter((path) => path === './cache/')).toHaveLength(
      1,
    );
  });

  it('never permanently caches a negative result while the md5 index is still empty', async () => {
    const gcodeContent = Buffer.from('content');
    const digest = createHash('md5')
      .update(gcodeContent)
      .digest('hex')
      .toUpperCase();
    const client = new FakeRemoteStorageClient(
      { './cache/': [entry('Job.gcode')], './image/md5/': [] },
      { './cache/Job.gcode': gcodeContent },
    );
    const service = new PrintJobThumbnailService(
      config(),
      fakeSessions(client),
    );

    const first = await service.resolveThumbnailId('Job.gcode.3mf');
    expect(first).toBeUndefined();

    // The index "arrives" late — simulates the printer coming online after
    // mqtt-puppeteer's initial index build already ran (or failed) empty.
    client.setDirectory('./image/md5/', [entry('42.md5')]);
    client.setFile('./image/md5/42.md5', Buffer.from(digest));
    // Force ensureIndex() to treat the cache as stale so the next
    // resolution re-lists the md5 directory instead of trusting the
    // (empty) in-memory index snapshot.
    (service as unknown as { lastIndexRefreshAt: number }).lastIndexRefreshAt =
      0;

    const second = await service.resolveThumbnailId('Job.gcode.3mf');
    expect(second).toBe('42');
  });

  it('never re-downloads an already-indexed md5 file on a subsequent resolution', async () => {
    const gcodeContent = Buffer.from('content');
    const digest = createHash('md5')
      .update(gcodeContent)
      .digest('hex')
      .toUpperCase();

    const client = new FakeRemoteStorageClient(
      {
        './cache/': [entry('Job_A.gcode'), entry('Job_B.gcode')],
        './image/md5/': [entry('1.md5')],
      },
      {
        './cache/Job_A.gcode': gcodeContent,
        './cache/Job_B.gcode': Buffer.from('other content'),
        './image/md5/1.md5': Buffer.from(digest),
      },
    );
    const service = new PrintJobThumbnailService(
      config(),
      fakeSessions(client),
    );

    await service.resolveThumbnailId('Job_A.gcode.3mf');
    await service.resolveThumbnailId('Job_B.gcode.3mf');

    expect(
      client.downloadCalls.filter((path) => path === './image/md5/1.md5'),
    ).toHaveLength(1);
  });

  it('reads the resolved thumbnail only for identifiers present in the index', async () => {
    const client = new FakeRemoteStorageClient(
      { './image/md5/': [entry('18047668811.md5')] },
      {
        './image/md5/18047668811.md5': Buffer.from('ABC'),
        './image/18047668811.png': Buffer.from('png-bytes'),
      },
    );
    const service = new PrintJobThumbnailService(
      config(),
      fakeSessions(client),
    );
    // Populates the index via the resolution path's ensureIndex().
    await service.resolveThumbnailId('nonexistent.gcode.3mf');

    await expect(service.readThumbnail('18047668811')).resolves.toEqual(
      Buffer.from('png-bytes'),
    );
    await expect(service.readThumbnail('unknown-id')).resolves.toBeUndefined();
  });

  describe('getCachedThumbnailId / requestResolution', () => {
    it('returns undefined synchronously until a background resolution completes', async () => {
      const gcodeContent = Buffer.from('content');
      const digest = createHash('md5')
        .update(gcodeContent)
        .digest('hex')
        .toUpperCase();
      const client = new FakeRemoteStorageClient(
        {
          './cache/': [entry('Job.gcode')],
          './image/md5/': [entry('42.md5')],
        },
        {
          './cache/Job.gcode': gcodeContent,
          './image/md5/42.md5': Buffer.from(digest),
        },
      );
      const service = new PrintJobThumbnailService(
        config(),
        fakeSessions(client),
      );

      expect(service.getCachedThumbnailId('Job.gcode.3mf')).toBeUndefined();
      service.requestResolution('Job.gcode.3mf');
      expect(service.getCachedThumbnailId('Job.gcode.3mf')).toBeUndefined();

      // Let the fire-and-forget resolution settle.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(service.getCachedThumbnailId('Job.gcode.3mf')).toBe('42');
    });
  });
});
