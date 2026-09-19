import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { RemoteEntryDto } from '@cloudless/printer-contracts';
import { HttpFilesDataService } from './http-files-data.service';

describe('HttpFilesDataService', () => {
  let httpMock: HttpTestingController;
  let service: HttpFilesDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(HttpFilesDataService);
  });

  afterEach(() => httpMock.verify());

  function expectList(path: string): ReturnType<HttpTestingController['expectOne']> {
    return httpMock.expectOne(`http://localhost:10321/files?path=${path}`);
  }

  it('loads only the root listing, mapping types/ids/kinds and leaving every folder unexpanded', async () => {
    const promise = service.load();

    const rootEntries: RemoteEntryDto[] = [
      { name: 'cache', path: '/cache', type: 'directory', size: 0 },
      {
        name: 'readme.txt',
        path: '/readme.txt',
        type: 'file',
        size: 128,
        modifiedAt: '2026-01-01T00:00:00.000Z',
      },
      { name: 'link', path: '/link', type: 'symbolic-link', size: 0 },
    ];
    expectList('/').flush(rootEntries);

    const data = await promise;

    expect(data.pinnedLocations).toEqual([]);
    expect(data.initialFolderPath).toBe('/');
    expect(data.uploadPath).toBe('/');

    // Root-level folders are no longer special-cased: they stay unloaded
    // ("not loaded yet") until the user expands them via loadFolder().
    const cacheNode = data.tree.find((node) => node.path === '/cache');
    expect(cacheNode?.type).toBe('folder');
    expect(cacheNode?.id).toBe('/cache');
    expect(cacheNode?.children).toBeUndefined();

    const readmeNode = data.tree.find((node) => node.path === '/readme.txt');
    expect(readmeNode?.type).toBe('file');
    expect(readmeNode?.children).toBeUndefined();

    const linkNode = data.tree.find((node) => node.path === '/link');
    expect(linkNode?.type).toBe('file');

    const readmeFile = data.files.find((file) => file.path === '/readme.txt');
    expect(readmeFile).toEqual({
      id: '/readme.txt',
      name: 'readme.txt',
      path: '/readme.txt',
      kind: 'log',
      extension: 'txt',
      sizeBytes: 128,
      modifiedAt: '2026-01-01T00:00:00.000Z',
      metadata: {},
    });
    expect(readmeFile?.thumbnailUrl).toBeUndefined();

    // Only root-level FILE entries (readme.txt, link) -- no subfolder is
    // fetched during load(), so /cache contributes no files at all.
    expect(data.files.length).toBe(2);
  });

  it('falls back to empty entries when modifiedAt is absent, never fabricating a timestamp', async () => {
    const promise = service.load();

    expectList('/').flush([{ name: 'x.bin', path: '/x.bin', type: 'unknown', size: 1 }]);

    const data = await promise;
    expect(data.files[0].modifiedAt).toBe('');
  });

  it('loadFolder fetches one directory and maps its direct children/files', async () => {
    const promise = service.loadFolder('/cache');

    expectList('/cache').flush([
      { name: 'nested', path: '/cache/nested', type: 'directory', size: 0 },
      { name: 'b.gcode', path: '/cache/b.gcode', type: 'file', size: 5 },
    ]);

    const result = await promise;
    expect(result.children).toEqual([
      expect.objectContaining({ id: '/cache/nested', type: 'folder', children: undefined }),
      expect.objectContaining({ id: '/cache/b.gcode', type: 'file' }),
    ]);
    expect(result.files).toEqual([expect.objectContaining({ id: '/cache/b.gcode' })]);
  });
});
