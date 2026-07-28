import { Injectable } from '@nestjs/common';
import type {
  RemoteFileBatchDeleteResultDto,
  RemoteFileLocationExtensionDto,
  RemoteEntryDto,
  RemoteStorageConnectionDto,
} from '@cloudless/printer-contracts';
import { randomUUID } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import { FtpsSessionService } from '../ftps/ftps-session.service';
import type { RemoteStorageClient } from '../ftps/remote-storage.client';
import { RemoteStorageOperationError } from '../ftps/remote-storage.errors';
import { toRemoteEntryDto } from './remote-file.mapper';
import {
  RemoteFileExtension,
  RemoteFileName,
  RemoteFilePattern,
} from './remote-file-selector';
import { RemotePath } from './remote-path';

@Injectable()
export class RemoteFileService {
  constructor(private readonly sessions: FtpsSessionService) {}

  async testConnection(): Promise<RemoteStorageConnectionDto> {
    await this.sessions.execute(
      'connect',
      async (client) => void (await client.list('/')),
    );
    return { ok: true };
  }

  list(path = '/'): Promise<RemoteEntryDto[]> {
    const remotePath = RemotePath.from(path);
    return this.sessions.execute('list', async (client) =>
      (await client.list(remotePath.value)).map((entry) =>
        toRemoteEntryDto(remotePath, entry),
      ),
    );
  }

  async download(path: string, destination: Writable): Promise<void> {
    const remotePath = RemotePath.from(path).assertNotRoot('Downloading');
    await this.sessions.execute('download', async (client) => {
      await client.download(destination, remotePath.value);
    });
  }

  async upload(path: string, content: Readable, force = false): Promise<void> {
    const destination = RemotePath.from(path).assertNotRoot('Uploading to');
    const temporary = destination.temporaryUpload(randomUUID());
    let temporaryMayExist = false;
    let backup: RemotePath | undefined;
    let replacingExisting = false;

    try {
      await this.sessions.execute('upload', async (client) => {
        const destinationExists = await this.entryExists(client, destination);
        if (destinationExists && !force) {
          throw new RemoteStorageOperationError('conflict', 'upload');
        }

        if (destinationExists) {
          replacingExisting = true;
          backup = destination.temporaryBackup(randomUUID());
          await client.move(destination.value, backup.value);
          await client.upload(content, destination.value);
          try {
            await client.deleteFile(backup.value);
            backup = undefined;
          } catch {
            return;
          }
          return;
        }

        temporaryMayExist = true;
        await client.upload(content, temporary.value);
        await client.move(temporary.value, destination.value);
        temporaryMayExist = false;
      });
    } catch (error) {
      if (replacingExisting && backup) {
        await this.restoreBackup(destination, backup);
      }
      if (temporaryMayExist) await this.removeTemporaryUpload(temporary);
      throw error;
    }

    if (backup) await this.removeTemporaryUpload(backup);
  }

  async move(source: string, destination: string): Promise<void> {
    const sourcePath = RemotePath.from(source).assertNotRoot('Moving');
    const destinationPath =
      RemotePath.from(destination).assertNotRoot('Moving to');
    await this.sessions.execute('move', async (client) => {
      await client.move(sourcePath.value, destinationPath.value);
    });
  }

  async deleteFile(path: string): Promise<void> {
    const remotePath = RemotePath.from(path).assertNotRoot('Deleting');
    await this.sessions.execute('delete-file', async (client) => {
      await client.deleteFile(remotePath.value);
    });
  }

  async deleteFilesByName(
    name: string,
    targets: RemoteFileLocationExtensionDto[],
  ): Promise<RemoteFileBatchDeleteResultDto> {
    const filename = RemoteFileName.from(name);
    const selectors = targets.map(({ path, prefix, suffix, extension }) => ({
      directory: RemotePath.from(path),
      pattern: RemoteFilePattern.from(filename, prefix, suffix, extension),
    }));

    return this.sessions.execute('delete-file', async (client) => {
      const listings = new Map<
        string,
        Awaited<ReturnType<RemoteStorageClient['list']>>
      >();
      const matchedPaths: RemotePath[] = [];
      const missingPatterns: string[] = [];

      for (const selector of selectors) {
        let entries = listings.get(selector.directory.value);
        if (!entries) {
          entries = await client.list(selector.directory.value);
          listings.set(selector.directory.value, entries);
        }
        const matches = entries
          .filter(
            (entry) =>
              entry.type === 'file' && selector.pattern.matches(entry.name),
          )
          .map((entry) => selector.directory.child(entry.name));
        if (matches.length === 0) {
          missingPatterns.push(
            selector.directory.child(selector.pattern.displayValue).value,
          );
        } else {
          matchedPaths.push(...matches);
        }
      }

      const result = await this.deletePathsWithClient(
        client,
        uniquePaths(matchedPaths),
      );
      result.notFound.unshift(...missingPatterns);
      return result;
    });
  }

  async deleteFilesByExtension(
    path: string,
    extension: string,
  ): Promise<RemoteFileBatchDeleteResultDto> {
    const directory = RemotePath.from(path);
    const selector = RemoteFileExtension.from(extension);

    return this.sessions.execute('delete-file', async (client) => {
      const entries = await client.list(directory.value);
      const paths = entries
        .filter(
          (entry) => entry.type === 'file' && selector.matches(entry.name),
        )
        .map((entry) => directory.child(entry.name));
      return this.deletePathsWithClient(client, paths);
    });
  }

  async createDirectory(path: string): Promise<void> {
    const remotePath = RemotePath.from(path).assertNotRoot('Creating');
    await this.sessions.execute('create-directory', async (client) => {
      await client.createDirectory(remotePath.value);
    });
  }

  async deleteDirectory(path: string): Promise<void> {
    const remotePath = RemotePath.from(path).assertNotRoot('Deleting');
    await this.sessions.execute('delete-directory', async (client) => {
      await client.deleteDirectory(remotePath.value);
    });
  }

  private async removeTemporaryUpload(path: RemotePath): Promise<void> {
    try {
      await this.sessions.execute('delete-file', async (client) => {
        await client.deleteFile(path.value);
      });
    } catch {
      return;
    }
  }

  private async deletePathsWithClient(
    client: RemoteStorageClient,
    paths: RemotePath[],
  ): Promise<RemoteFileBatchDeleteResultDto> {
    const result: RemoteFileBatchDeleteResultDto = {
      deleted: [],
      notFound: [],
    };
    for (const path of paths) {
      try {
        await client.deleteFile(path.value);
        result.deleted.push(path.value);
      } catch (error) {
        if (
          error instanceof RemoteStorageOperationError &&
          error.kind === 'not-found'
        ) {
          result.notFound.push(path.value);
          continue;
        }
        throw error;
      }
    }
    return result;
  }

  private async entryExists(
    client: RemoteStorageClient,
    path: RemotePath,
  ): Promise<boolean> {
    const entries = await client.list(path.parent().value);
    return entries.some((entry) => entry.name === path.filename());
  }

  private async restoreBackup(
    destination: RemotePath,
    backup: RemotePath,
  ): Promise<void> {
    try {
      await this.sessions.execute('move', async (client) => {
        try {
          await client.deleteFile(destination.value);
        } catch (error) {
          if (!(
            error instanceof RemoteStorageOperationError &&
            error.kind === 'not-found'
          )) {
            throw error;
          }
        }
        await client.move(backup.value, destination.value);
      });
    } catch {
      return;
    }
  }
}

function uniquePaths(paths: RemotePath[]): RemotePath[] {
  return [...new Map(paths.map((path) => [path.value, path])).values()];
}
