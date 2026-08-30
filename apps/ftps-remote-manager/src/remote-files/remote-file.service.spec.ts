import { PassThrough, Readable } from 'node:stream';
import type { RemoteStorageClient } from '../ftps/remote-storage.client';
import { FtpsSessionService } from '../ftps/ftps-session.service';
import { RemoteFileService } from './remote-file.service';

/* eslint-disable @typescript-eslint/unbound-method */

describe('RemoteFileService', () => {
  let client: jest.Mocked<RemoteStorageClient>;
  let sessions: jest.Mocked<Pick<FtpsSessionService, 'execute'>>;
  let service: RemoteFileService;

  beforeEach(() => {
    client = {
      connect: jest.fn(),
      close: jest.fn(),
      list: jest.fn().mockResolvedValue([
        {
          name: 'model.3mf',
          type: 'file',
          size: 1024,
          modifiedAt: new Date('2026-07-01T12:00:00.000Z'),
        },
      ]),
      download: jest.fn().mockImplementation((destination: PassThrough) => {
        destination.end(Buffer.from('model'));
        return Promise.resolve();
      }),
      upload: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      move: jest.fn().mockResolvedValue(undefined),
      createDirectory: jest.fn().mockResolvedValue(undefined),
      deleteDirectory: jest.fn().mockResolvedValue(undefined),
    };
    sessions = {
      execute: jest.fn(
        (
          _operationName: string,
          operation: (connectedClient: RemoteStorageClient) => Promise<unknown>,
        ) => operation(client),
      ),
    } as unknown as jest.Mocked<Pick<FtpsSessionService, 'execute'>>;
    service = new RemoteFileService(sessions as unknown as FtpsSessionService);
  });

  it('maps storage entries to shared DTOs', async () => {
    await expect(service.list('/models')).resolves.toEqual([
      {
        name: 'model.3mf',
        path: '/models/model.3mf',
        type: 'file',
        size: 1024,
        modifiedAt: '2026-07-01T12:00:00.000Z',
      },
    ]);
  });

  it('streams downloads without buffering the whole file', async () => {
    const destination = new PassThrough();
    const chunks: Buffer[] = [];
    destination.on('data', (chunk: Buffer) => chunks.push(chunk));

    await service.download('/model.3mf', destination);

    expect(Buffer.concat(chunks).toString()).toBe('model');
    expect(client.download).toHaveBeenCalledWith(destination, '/model.3mf');
  });

  it('uploads to a temporary file and moves it to the destination', async () => {
    const source = Readable.from(Buffer.from('new model'));

    await service.upload('/models/new.3mf', source);

    const temporaryPath = client.upload.mock.calls[0][1];
    expect(temporaryPath).toMatch(
      /^\/models\/\.new\.3mf\.upload-[0-9a-f-]{36}$/,
    );
    expect(client.upload).toHaveBeenCalledWith(source, temporaryPath);
    expect(client.move).toHaveBeenCalledWith(temporaryPath, '/models/new.3mf');
    expect(client.deleteFile).not.toHaveBeenCalled();
  });

  it('rejects an existing destination unless force is enabled', async () => {
    client.list.mockResolvedValueOnce([
      { name: 'new.3mf', type: 'file', size: 1 },
    ]);

    await expect(
      service.upload('/models/new.3mf', Readable.from('model')),
    ).rejects.toMatchObject({ kind: 'conflict' });

    expect(client.upload).not.toHaveBeenCalled();
    expect(client.move).not.toHaveBeenCalled();
  });

  it('replaces an existing destination when force is enabled', async () => {
    client.list.mockResolvedValueOnce([
      { name: 'new.3mf', type: 'file', size: 1 },
    ]);
    const source = Readable.from('replacement');

    await service.upload('/models/new.3mf', source, true);

    const backupPath = client.move.mock.calls[0][1];
    expect(backupPath).toMatch(/^\/models\/\.new\.3mf\.backup-[0-9a-f-]{36}$/);
    expect(client.move).toHaveBeenCalledTimes(1);
    expect(client.move).toHaveBeenCalledWith('/models/new.3mf', backupPath);
    expect(client.upload).toHaveBeenCalledWith(source, '/models/new.3mf');
    expect(client.deleteFile).toHaveBeenCalledWith(backupPath);
  });

  it('restores the previous destination when forced publication fails', async () => {
    client.list.mockResolvedValueOnce([
      { name: 'new.3mf', type: 'file', size: 1 },
    ]);
    client.upload.mockRejectedValueOnce(new Error('publication failed'));
    client.deleteFile.mockResolvedValueOnce(undefined);

    await expect(
      service.upload('/models/new.3mf', Readable.from('replacement'), true),
    ).rejects.toThrow('publication failed');

    const backupPath = client.move.mock.calls[0][1];
    expect(client.deleteFile).toHaveBeenCalledWith('/models/new.3mf');
    expect(client.move).toHaveBeenLastCalledWith(backupPath, '/models/new.3mf');
  });

  it('attempts cleanup after a failed temporary upload', async () => {
    client.upload.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      service.upload('/models/new.3mf', Readable.from('partial')),
    ).rejects.toThrow('connection lost');

    const temporaryPath = client.upload.mock.calls[0][1];
    expect(client.move).not.toHaveBeenCalled();
    expect(client.deleteFile).toHaveBeenCalledWith(temporaryPath);
  });

  it('preserves the upload error when cleanup also fails', async () => {
    client.upload.mockRejectedValueOnce(new Error('upload failed'));
    client.deleteFile.mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(
      service.upload('/models/new.3mf', Readable.from('partial')),
    ).rejects.toThrow('upload failed');
  });

  it('delegates move, file deletion and directory operations', async () => {
    await service.move('/new.3mf', '/archive/new.3mf');
    await service.deleteFile('/archive/new.3mf');
    await service.createDirectory('/models');
    await service.deleteDirectory('/models');

    expect(client.move).toHaveBeenCalledWith('/new.3mf', '/archive/new.3mf');
    expect(client.deleteFile).toHaveBeenCalledWith('/archive/new.3mf');
    expect(client.createDirectory).toHaveBeenCalledWith('/models');
    expect(client.deleteDirectory).toHaveBeenCalledWith('/models');
  });

  it('deletes a named file from every path and extension pair', async () => {
    client.list
      .mockResolvedValueOnce([{ name: 'file.3mf', type: 'file', size: 1 }])
      .mockResolvedValueOnce([]);

    await expect(
      service.deleteFilesByName('file', [
        { path: '/models', extension: '.3mf' },
        { path: '/cache', extension: '.gcode' },
      ]),
    ).resolves.toEqual({
      deleted: ['/models/file.3mf'],
      notFound: ['/cache/file.gcode'],
    });
  });

  it('matches wildcard prefixes and suffixes for a named file', async () => {
    client.list.mockResolvedValueOnce([
      {
        name: 'plate_12_(Niezapisany)_a.gcode.3mf',
        type: 'file',
        size: 1,
      },
      {
        name: 'plate_(Niezapisany)_long.gcode.3mf',
        type: 'file',
        size: 1,
      },
      { name: '(Niezapisany).gcode.3mf', type: 'file', size: 1 },
    ]);

    await expect(
      service.deleteFilesByName('(Niezapisany)', [
        {
          path: '/models',
          prefix: 'plate_*_',
          suffix: '_?',
          extension: '.gcode.3mf',
        },
      ]),
    ).resolves.toEqual({
      deleted: ['/models/plate_12_(Niezapisany)_a.gcode.3mf'],
      notFound: [],
    });
  });

  it('deletes only direct files with the requested extension', async () => {
    client.list.mockResolvedValueOnce([
      { name: 'first.log', type: 'file', size: 1 },
      { name: 'SECOND.LOG', type: 'file', size: 1 },
      { name: 'model.3mf', type: 'file', size: 1 },
      { name: 'archive.log', type: 'directory', size: 0 },
    ]);

    await expect(
      service.deleteFilesByExtension('/logs', '.log'),
    ).resolves.toEqual({
      deleted: ['/logs/first.log', '/logs/SECOND.LOG'],
      notFound: [],
    });
    expect(client.deleteFile.mock.calls).toEqual([
      ['/logs/first.log'],
      ['/logs/SECOND.LOG'],
    ]);
  });
});
