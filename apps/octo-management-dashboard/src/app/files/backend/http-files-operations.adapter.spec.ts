import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { FileListItem } from '../files-dashboard.models';
import { HttpFilesOperationsAdapter } from './http-files-operations.adapter';

const BASE_URL = 'http://localhost:10321';

const file = (overrides: Partial<FileListItem> = {}): FileListItem => ({
  id: '/home/a.gcode',
  name: 'a.gcode',
  path: '/home/a.gcode',
  kind: 'gcode',
  extension: 'gcode',
  sizeBytes: 10,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  metadata: {},
  ...overrides,
});

describe('HttpFilesOperationsAdapter', () => {
  let httpMock: HttpTestingController;
  let service: HttpFilesOperationsAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(HttpFilesOperationsAdapter);
  });

  afterEach(() => httpMock.verify());

  describe('execute', () => {
    it('deletes a file via DELETE /files/*path', async () => {
      const promise = service.execute('delete', file());

      const request = httpMock.expectOne(`${BASE_URL}/files/home/a.gcode`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(await promise).toBe('ok');
    });

    it('URL-encodes path segments so spaces/special characters survive', async () => {
      const promise = service.execute('delete', file({ path: '/home/Benchy v2 #1.gcode' }));

      const request = httpMock.expectOne(`${BASE_URL}/files/home/Benchy%20v2%20%231.gcode`);
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(await promise).toBe('ok');
    });

    it('renames a file as a move to the same directory with the new name', async () => {
      const promise = service.execute('rename', file(), 'b.gcode');

      const request = httpMock.expectOne(`${BASE_URL}/files/move`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        source: '/home/a.gcode',
        destination: '/home/b.gcode',
      });
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(await promise).toBe('ok');
    });

    it('moves a file to the given destination directory, keeping its name', async () => {
      const promise = service.execute('move', file(), '/archive');

      const request = httpMock.expectOne(`${BASE_URL}/files/move`);
      expect(request.request.body).toEqual({
        source: '/home/a.gcode',
        destination: '/archive/a.gcode',
      });
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(await promise).toBe('ok');
    });

    it('returns error for rename/move without a destination, never calling the backend', async () => {
      expect(await service.execute('rename', file())).toBe('error');
      expect(await service.execute('move', file(), '   ')).toBe('error');
      httpMock.verify();
    });

    it('returns error when the backend call fails', async () => {
      const promise = service.execute('delete', file());
      httpMock
        .expectOne(`${BASE_URL}/files/home/a.gcode`)
        .flush({ statusCode: 500, message: 'x' }, { status: 500, statusText: 'Server Error' });
      expect(await promise).toBe('error');
    });
  });

  describe('upload', () => {
    it('PUTs the raw file bytes with an explicit octet-stream Content-Type', async () => {
      const upload = new File(['content'], 'new.gcode');
      const promise = service.upload('/home', upload);

      const request = httpMock.expectOne(
        (req) => req.url === `${BASE_URL}/files/home/new.gcode` && req.method === 'PUT',
      );
      expect(request.request.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(request.request.params.get('force')).toBe('false');
      expect(request.request.body).toBe(upload);
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(await promise).toBe('ok');
    });

    it('passes force=true through when retrying after a conflict', async () => {
      const upload = new File(['content'], 'new.gcode');
      const promise = service.upload('/home', upload, true);

      const request = httpMock.expectOne(
        (req) => req.url === `${BASE_URL}/files/home/new.gcode` && req.method === 'PUT',
      );
      expect(request.request.params.get('force')).toBe('true');
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(await promise).toBe('ok');
    });

    it('maps a 409 response to the conflict result', async () => {
      const upload = new File(['content'], 'new.gcode');
      const promise = service.upload('/home', upload);

      httpMock
        .expectOne((req) => req.url === `${BASE_URL}/files/home/new.gcode`)
        .flush({ statusCode: 409, message: 'conflict' }, { status: 409, statusText: 'Conflict' });

      expect(await promise).toBe('conflict');
    });

    it('maps any other failure to the error result', async () => {
      const upload = new File(['content'], 'new.gcode');
      const promise = service.upload('/home', upload);

      httpMock
        .expectOne((req) => req.url === `${BASE_URL}/files/home/new.gcode`)
        .flush({ statusCode: 503, message: 'x' }, { status: 503, statusText: 'x' });

      expect(await promise).toBe('error');
    });
  });

  describe('download', () => {
    it('fetches the file as a blob from GET /files/*path', async () => {
      const promise = service.download(file());

      const request = httpMock.expectOne(`${BASE_URL}/files/home/a.gcode`);
      expect(request.request.method).toBe('GET');
      expect(request.request.responseType).toBe('blob');
      request.flush(new Blob(['bytes']));

      await promise;
    });
  });
});
