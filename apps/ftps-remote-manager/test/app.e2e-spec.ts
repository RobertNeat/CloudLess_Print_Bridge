import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Writable } from 'node:stream';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SERVICE_CONFIG } from './../src/config/config.module';
import type { ServiceConfig } from './../src/config/service-config';
import { RemoteFileService } from './../src/remote-files/remote-file.service';
import { RemoteStorageOperationError } from './../src/ftps/remote-storage.errors';

describe('remote file API (e2e, dry run)', () => {
  let app: INestApplication<App>;
  let files: {
    testConnection: jest.Mock;
    list: jest.Mock;
    download: jest.Mock;
    upload: jest.Mock;
    move: jest.Mock;
    createDirectory: jest.Mock;
    deleteDirectory: jest.Mock;
    deleteFile: jest.Mock;
    deleteFilesByName: jest.Mock;
    deleteFilesByExtension: jest.Mock;
  };

  beforeEach(async () => {
    files = {
      testConnection: jest.fn().mockResolvedValue({ ok: true }),
      list: jest.fn().mockResolvedValue([
        {
          name: 'model.3mf',
          path: '/model.3mf',
          type: 'file',
          size: 1024,
        },
      ]),
      download: jest
        .fn()
        .mockImplementation((_path: string, destination: Writable) => {
          destination.end(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
          return Promise.resolve();
        }),
      upload: jest.fn().mockResolvedValue(undefined),
      move: jest.fn().mockResolvedValue(undefined),
      createDirectory: jest.fn().mockResolvedValue(undefined),
      deleteDirectory: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      deleteFilesByName: jest.fn().mockResolvedValue({
        deleted: ['/models/file.3mf'],
        notFound: ['/cache/file.gcode'],
      }),
      deleteFilesByExtension: jest.fn().mockResolvedValue({
        deleted: ['/logs/device.log'],
        notFound: [],
      }),
    };
    const config: ServiceConfig = {
      http: { host: '127.0.0.1', port: 10321, corsOrigins: true },
      ftps: {
        host: 'printer',
        port: 990,
        username: 'bblp',
        password: 'secret',
        tlsMode: 'implicit',
        certificateFingerprint256: 'A'.repeat(64),
        timeoutMs: 1000,
        maximumConcurrentSessions: 1,
      },
      upload: { maximumBytes: 1024 },
      auth: {
        mode: 'disabled',
        serviceName: 'ftps-remote-manager',
        sharedSecret: undefined,
        tokenIssuerOrder: [
          'mqtt-puppeteer',
          'ftps-remote-manager',
          'video-service-hub',
        ],
        tokenTtlSeconds: 86_400,
      },
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SERVICE_CONFIG)
      .useValue(config)
      .overrideProvider(RemoteFileService)
      .useValue(files)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('lists a directory using stable shared DTOs', () => {
    return request(app.getHttpServer())
      .get('/files')
      .expect(200)
      .expect([
        {
          name: 'model.3mf',
          path: '/model.3mf',
          type: 'file',
          size: 1024,
        },
      ]);
  });

  it('downloads raw bytes', () => {
    return request(app.getHttpServer())
      .get('/files/model.3mf')
      .expect('Content-Type', 'application/octet-stream')
      .expect(200)
      .expect(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('accepts binary uploads and returns 204', async () => {
    await request(app.getHttpServer())
      .put('/files/model.3mf')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('model'))
      .expect(204);
    expect(files.upload).toHaveBeenCalled();
  });

  it('passes the force flag to uploads', async () => {
    await request(app.getHttpServer())
      .put('/files/model.3mf?force=true')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('model'))
      .expect(204);

    expect(files.upload).toHaveBeenCalledWith(
      '/model.3mf',
      expect.anything(),
      true,
    );
  });

  it('returns the documented conflict for an existing upload', async () => {
    files.upload.mockRejectedValueOnce(
      new RemoteStorageOperationError('conflict', 'upload'),
    );

    await request(app.getHttpServer())
      .put('/files/model.3mf')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('model'))
      .expect(409)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe(
          'Remote entry conflicts with an existing entry',
        );
      });
  });

  it('rejects invalid force values', async () => {
    await request(app.getHttpServer())
      .put('/files/model.3mf?force=yes')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('model'))
      .expect(400);

    expect(files.upload).not.toHaveBeenCalled();
  });

  it('rejects malformed move requests before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/files/move')
      .send({ source: '/model.3mf' })
      .expect(400);
    expect(files.move).not.toHaveBeenCalled();
  });

  it('routes directory deletion before the wildcard file route', async () => {
    await request(app.getHttpServer())
      .delete('/files/directories')
      .query({ path: '/models' })
      .expect(204);

    expect(files.deleteDirectory).toHaveBeenCalledWith('/models');
    expect(files.deleteFile).not.toHaveBeenCalled();
  });

  it('deletes a name for an arbitrary list of path-extension pairs', async () => {
    await request(app.getHttpServer())
      .delete('/files/by-name/file')
      .send({
        targets: [
          { path: '/models', extension: '.3mf' },
          { path: '/cache', extension: '.gcode' },
        ],
      })
      .expect(200)
      .expect({
        deleted: ['/models/file.3mf'],
        notFound: ['/cache/file.gcode'],
      });

    expect(files.deleteFilesByName).toHaveBeenCalledWith('file', [
      { path: '/models', extension: '.3mf' },
      { path: '/cache', extension: '.gcode' },
    ]);
  });

  it('rejects an empty path-extension target list', async () => {
    await request(app.getHttpServer())
      .delete('/files/by-name/file')
      .send({ targets: [] })
      .expect(400);

    expect(files.deleteFilesByName).not.toHaveBeenCalled();
  });

  it('accepts wildcard prefixes and suffixes for each target', async () => {
    await request(app.getHttpServer())
      .delete('/files/by-name/(Niezapisany)')
      .send({
        targets: [
          {
            path: '/models',
            prefix: 'plate_*_',
            suffix: '_?',
            extension: '.gcode.3mf',
          },
        ],
      })
      .expect(200);

    expect(files.deleteFilesByName).toHaveBeenCalledWith('(Niezapisany)', [
      {
        path: '/models',
        prefix: 'plate_*_',
        suffix: '_?',
        extension: '.gcode.3mf',
      },
    ]);
  });

  it('deletes files with an extension from one directory', async () => {
    await request(app.getHttpServer())
      .delete('/files/by-extension')
      .query({ path: '/logs', extension: '.log' })
      .expect(200)
      .expect({ deleted: ['/logs/device.log'], notFound: [] });

    expect(files.deleteFilesByExtension).toHaveBeenCalledWith('/logs', '.log');
  });

  it('rejects uploads with a non-binary content type', async () => {
    await request(app.getHttpServer())
      .put('/files/model.3mf')
      .send({ invalid: true })
      .expect(415);
    expect(files.upload).not.toHaveBeenCalled();
  });

  it('rejects a known oversized upload before calling the service', async () => {
    await request(app.getHttpServer())
      .put('/files/model.3mf')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(1025))
      .expect(413);

    expect(files.upload).not.toHaveBeenCalled();
  });

  it('rejects repeated path query parameters', async () => {
    await request(app.getHttpServer())
      .get('/files?path=%2F&path=%2Fmodels')
      .expect(400);

    expect(files.list).not.toHaveBeenCalled();
  });

  it.each([
    ['unavailable', 502],
    ['timeout', 504],
    ['not-found', 404],
    ['conflict', 409],
  ] as const)('maps %s storage failures to HTTP %s', async (kind, status) => {
    files.list.mockRejectedValueOnce(
      new RemoteStorageOperationError(kind, 'list'),
    );

    await request(app.getHttpServer()).get('/files').expect(status);
  });

  it('returns a JSON error when a download fails before streaming starts', async () => {
    files.download.mockRejectedValueOnce(
      new RemoteStorageOperationError('not-found', 'download'),
    );

    await request(app.getHttpServer())
      .get('/files/missing.3mf')
      .expect('Content-Type', /json/)
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
