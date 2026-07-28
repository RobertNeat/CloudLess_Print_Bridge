import type { ServiceConfig } from '../config/service-config';
import { FtpsClientFactory } from './ftps-client.factory';
import { FtpsSessionService } from './ftps-session.service';
import type { RemoteStorageClient } from './remote-storage.client';
import { RemoteStorageOperationError } from './remote-storage.errors';

/* eslint-disable @typescript-eslint/unbound-method */

describe('FtpsSessionService', () => {
  let client: jest.Mocked<RemoteStorageClient>;
  let service: FtpsSessionService;

  beforeEach(() => {
    client = {
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      list: jest.fn(),
      download: jest.fn(),
      upload: jest.fn(),
      deleteFile: jest.fn(),
      move: jest.fn(),
      createDirectory: jest.fn(),
      deleteDirectory: jest.fn(),
    };
    const factory = {
      create: jest.fn().mockReturnValue(client),
    } as unknown as FtpsClientFactory;
    const config = {
      ftps: { maximumConcurrentSessions: 1 },
    } as ServiceConfig;
    service = new FtpsSessionService(factory, config);
  });

  it('connects and closes after success', async () => {
    await expect(
      service.execute('list', () => Promise.resolve('complete')),
    ).resolves.toBe('complete');

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('closes and classifies a timeout', async () => {
    client.connect.mockRejectedValueOnce(
      new RemoteStorageOperationError('timeout', 'connect'),
    );

    await expect(
      service.execute('connect', () => Promise.resolve()),
    ).rejects.toMatchObject({
      kind: 'timeout',
      operation: 'connect',
    });
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('preserves classified storage errors', async () => {
    const error = new RemoteStorageOperationError('not-found', 'download');

    await expect(
      service.execute('download', () => Promise.reject(error)),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RemoteStorageOperationError>>({
        kind: 'not-found',
        operation: 'download',
      }),
    );
  });

  it('runs only one operation at a time with the default limit', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const entered: string[] = [];

    const first = service.execute('list', async () => {
      entered.push('first');
      await firstGate;
    });
    const second = service.execute('list', () => {
      entered.push('second');
      return Promise.resolve();
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(entered).toEqual(['first']);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(entered).toEqual(['first', 'second']);
  });
});
