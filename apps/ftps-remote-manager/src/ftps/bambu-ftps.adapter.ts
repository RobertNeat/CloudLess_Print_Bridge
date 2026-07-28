import {
  FileType,
  FTPError,
  type AccessOptions,
  type FileInfo,
} from 'basic-ftp';
import type { Readable, Writable } from 'node:stream';
import { BambuFtpsClient } from './bambu-ftps-client';
import type {
  RemoteStorageClient,
  RemoteStorageEntry,
  RemoteStorageEntryType,
} from './remote-storage.client';
import {
  RemoteStorageOperationError,
  type RemoteStorageFailureKind,
  type RemoteStorageOperation,
} from './remote-storage.errors';

export class BambuFtpsAdapter implements RemoteStorageClient {
  constructor(
    private readonly client: BambuFtpsClient,
    private readonly accessOptions: AccessOptions,
    private readonly certificateFingerprint256: string,
  ) {}

  async connect(): Promise<void> {
    await this.execute('connect', async () => {
      await this.client.access(
        this.accessOptions,
        this.certificateFingerprint256,
      );
    });
  }

  list(path: string): Promise<RemoteStorageEntry[]> {
    return this.execute('list', async () =>
      (await this.client.list(path)).map(toRemoteStorageEntry),
    );
  }

  async download(destination: Writable, remotePath: string): Promise<void> {
    await this.execute('download', async () => {
      await this.client.downloadTo(destination, remotePath);
    });
  }

  async upload(source: Readable, remotePath: string): Promise<void> {
    await this.execute('upload', async () => {
      await this.client.uploadFrom(source, remotePath);
    });
  }

  async deleteFile(remotePath: string): Promise<void> {
    await this.execute('delete-file', async () => {
      await this.client.remove(remotePath);
    });
  }

  async move(source: string, destination: string): Promise<void> {
    await this.execute('move', async () => {
      await this.client.rename(source, destination);
    });
  }

  async createDirectory(path: string): Promise<void> {
    await this.execute('create-directory', async () => {
      await this.client.ensureDir(path);
    });
  }

  async deleteDirectory(path: string): Promise<void> {
    await this.execute('delete-directory', async () => {
      await this.client.removeDir(path);
    });
  }

  close(): void {
    this.client.close();
  }

  private async execute<T>(
    operation: RemoteStorageOperation,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw new RemoteStorageOperationError(
        classifyFailure(error, operation),
        operation,
        { cause: error },
      );
    }
  }
}

function toRemoteStorageEntry(entry: FileInfo): RemoteStorageEntry {
  return {
    name: entry.name,
    type: toRemoteStorageEntryType(entry.type),
    size: entry.size,
    ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
  };
}

function toRemoteStorageEntryType(type: FileType): RemoteStorageEntryType {
  switch (type) {
    case FileType.File:
      return 'file';
    case FileType.Directory:
      return 'directory';
    case FileType.SymbolicLink:
      return 'symbolic-link';
    default:
      return 'unknown';
  }
}

function classifyFailure(
  error: unknown,
  operation: RemoteStorageOperation,
): RemoteStorageFailureKind {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (
    code === 'ETIMEDOUT' ||
    code === 'ESOCKETTIMEDOUT' ||
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return 'timeout';
  }
  if (code === 'ENOENT') return 'not-found';
  if (code === 'EEXIST') return 'conflict';
  if (
    message.includes('not found') ||
    message.includes('no such') ||
    message.includes('does not exist')
  ) {
    return 'not-found';
  }
  if (message.includes('already exists') || message.includes('file exists')) {
    return 'conflict';
  }
  if (error instanceof FTPError && error.code === 550) {
    return operation === 'upload' ||
      operation === 'move' ||
      operation === 'create-directory'
      ? 'conflict'
      : 'not-found';
  }
  return 'unavailable';
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
