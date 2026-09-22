import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { FILES_OPERATIONS, FILES_REPOSITORY } from './files-dashboard.ports';
import type { FileListItem, FilesDashboardData } from './files-dashboard.models';
import { FilesDashboardPage } from './files-dashboard-page';

const file = (id: string): FileListItem => ({
  id,
  name: `${id}.gcode`,
  path: `/home/${id}.gcode`,
  kind: 'gcode',
  extension: 'gcode',
  sizeBytes: 1024,
  modifiedAt: '2026-08-03T10:00:00+02:00',
  metadata: {},
});

const data: FilesDashboardData = {
  pinnedLocations: [],
  tree: [
    {
      id: 'home',
      name: 'HOME',
      type: 'folder',
      path: '/home',
      children: [
        { id: 'first-node', name: 'first.gcode', type: 'file', path: '/home/first.gcode' },
        { id: 'second-node', name: 'second.gcode', type: 'file', path: '/home/second.gcode' },
      ],
    },
  ],
  files: [file('first'), file('second')],
  initialFolderPath: '/home',
  uploadPath: '/home',
};

describe('FilesDashboardPage', () => {
  it('selects the file clicked in the tree, not the first file in its folder', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FILES_REPOSITORY,
          useValue: {
            load: async () => data,
            loadFolder: async () => ({ children: [], files: [] }),
            listAllFolders: async () => ['/home'],
          },
        },
        {
          provide: FILES_OPERATIONS,
          useValue: {
            execute: async () => 'ok' as const,
            upload: async () => 'ok' as const,
            download: async () => {},
          },
        },
        MessageService,
      ],
    });
    const fixture = TestBed.createComponent(FilesDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.tree-node'),
    ) as HTMLButtonElement[];
    const second = buttons.find((button) => button.textContent?.includes('second.gcode'));
    second?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.details-title strong')?.textContent).toContain(
      'second.gcode',
    );
  });

  it('move populates the destination select from listAllFolders and sends the absolute path the backend expects', async () => {
    const executed: Array<{ action: string; destination?: string }> = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FILES_REPOSITORY,
          useValue: {
            load: async () => data,
            loadFolder: async () => ({ children: [], files: [] }),
            listAllFolders: async () => ['/home', '/archive', '/archive/old'],
          },
        },
        {
          provide: FILES_OPERATIONS,
          useValue: {
            execute: async (action: string, _file: FileListItem, destination?: string) => {
              executed.push({ action, destination });
              return 'ok' as const;
            },
            upload: async () => 'ok' as const,
            download: async () => {},
          },
        },
        MessageService,
      ],
    });
    const fixture = TestBed.createComponent(FilesDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const page = fixture.componentInstance as unknown as {
      executeFileAction: (r: { action: string; file: FileListItem }) => Promise<void>;
      destinationOptions: () => Array<{ path: string; label: string }>;
      moveDestinationPath: { set: (v: string) => void };
      canConfirmDestinationPrompt: () => boolean;
      confirmDestinationPrompt: () => Promise<void>;
    };

    await page.executeFileAction({ action: 'move', file: file('first') });
    await fixture.whenStable();

    expect(page.destinationOptions()).toEqual([
      { path: '/home', label: '/home/' },
      { path: '/archive', label: '/archive/' },
      { path: '/archive/old', label: '/archive/old/' },
    ]);
    // Never a raw user-typed string like "./archive" -- only a path taken
    // verbatim from the backend's own directory listing reaches execute().
    expect(page.canConfirmDestinationPrompt()).toBe(true); // pre-selected: file's own folder

    page.moveDestinationPath.set('/archive/old');
    await page.confirmDestinationPrompt();

    expect(executed).toEqual([{ action: 'move', destination: '/archive/old' }]);
  });

  it('rename keeps using the free-text destination input, unaffected by the move picker', async () => {
    const executed: Array<{ action: string; destination?: string }> = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FILES_REPOSITORY,
          useValue: {
            load: async () => data,
            loadFolder: async () => ({ children: [], files: [] }),
            listAllFolders: async () => ['/home'],
          },
        },
        {
          provide: FILES_OPERATIONS,
          useValue: {
            execute: async (action: string, _file: FileListItem, destination?: string) => {
              executed.push({ action, destination });
              return 'ok' as const;
            },
            upload: async () => 'ok' as const,
            download: async () => {},
          },
        },
        MessageService,
      ],
    });
    const fixture = TestBed.createComponent(FilesDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const page = fixture.componentInstance as unknown as {
      executeFileAction: (r: { action: string; file: FileListItem }) => Promise<void>;
      destinationInput: { set: (v: string) => void };
      confirmDestinationPrompt: () => Promise<void>;
    };

    await page.executeFileAction({ action: 'rename', file: file('first') });
    page.destinationInput.set('renamed.gcode');
    await page.confirmDestinationPrompt();

    expect(executed).toEqual([{ action: 'rename', destination: 'renamed.gcode' }]);
  });

  it('upload opens a destination picker sourced from listAllFolders and uploads to the chosen path, not selectedFolderPath', async () => {
    const uploaded: Array<{ path: string; fileName: string }> = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FILES_REPOSITORY,
          useValue: {
            load: async () => data,
            loadFolder: async () => ({ children: [], files: [] }),
            listAllFolders: async () => ['/home', '/archive'],
          },
        },
        {
          provide: FILES_OPERATIONS,
          useValue: {
            execute: async () => 'ok' as const,
            upload: async (path: string, uploadedFile: File) => {
              uploaded.push({ path, fileName: uploadedFile.name });
              return 'ok' as const;
            },
            download: async () => {},
          },
        },
        MessageService,
      ],
    });
    const fixture = TestBed.createComponent(FilesDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const page = fixture.componentInstance as unknown as {
      requestUpload: (f: File) => void;
      destinationOptions: () => Array<{ path: string; label: string }>;
      uploadDestinationPath: { set: (v: string) => void; (): string };
      canConfirmUploadPrompt: () => boolean;
      confirmUploadPrompt: () => Promise<void>;
    };

    const uploadFile = new File(['data'], 'model.gcode');
    page.requestUpload(uploadFile);
    await fixture.whenStable();

    expect(page.destinationOptions()).toEqual([
      { path: '/home', label: '/home/' },
      { path: '/archive', label: '/archive/' },
    ]);
    // Pre-selected from selectedFolderPath (the file's own folder is /home per
    // the seeded dashboard data), but the user can still choose a different one.
    expect(page.uploadDestinationPath()).toBe('/home');

    page.uploadDestinationPath.set('/archive');
    await page.confirmUploadPrompt();

    expect(uploaded).toEqual([{ path: '/archive', fileName: 'model.gcode' }]);
  });

  it('ignores repeat download clicks on the same file during the cooldown and shows a starting toast', async () => {
    let downloadCalls = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FILES_REPOSITORY,
          useValue: {
            load: async () => data,
            loadFolder: async () => ({ children: [], files: [] }),
            listAllFolders: async () => ['/home'],
          },
        },
        {
          provide: FILES_OPERATIONS,
          useValue: {
            execute: async () => 'ok' as const,
            upload: async () => 'ok' as const,
            download: async () => {
              downloadCalls += 1;
            },
          },
        },
        MessageService,
      ],
    });
    const fixture = TestBed.createComponent(FilesDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const page = fixture.componentInstance as unknown as {
      executeFileAction: (r: { action: string; file: FileListItem }) => Promise<void>;
    };
    const addSpy = vi.spyOn(TestBed.inject(MessageService), 'add');

    await page.executeFileAction({ action: 'download', file: file('first') });
    await page.executeFileAction({ action: 'download', file: file('first') });

    expect(downloadCalls).toBe(1);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info', detail: expect.stringContaining('first.gcode') }),
    );

    await page.executeFileAction({ action: 'download', file: file('second') });
    expect(downloadCalls).toBe(2);
  });

  it('rejects a delete during the cooldown with an error toast instead of re-running the operation', async () => {
    let deleteCalls = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FILES_REPOSITORY,
          useValue: {
            load: async () => data,
            loadFolder: async () => ({ children: [], files: [] }),
            listAllFolders: async () => ['/home'],
          },
        },
        {
          provide: FILES_OPERATIONS,
          useValue: {
            execute: async () => {
              deleteCalls += 1;
              return 'ok' as const;
            },
            upload: async () => 'ok' as const,
            download: async () => {},
          },
        },
        MessageService,
      ],
    });
    const fixture = TestBed.createComponent(FilesDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const page = fixture.componentInstance as unknown as {
      executeFileAction: (r: { action: string; file: FileListItem }) => Promise<void>;
    };
    const addSpy = vi.spyOn(TestBed.inject(MessageService), 'add');

    await page.executeFileAction({ action: 'delete', file: file('first') });
    await page.executeFileAction({ action: 'delete', file: file('first') });

    expect(deleteCalls).toBe(1);
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: expect.stringContaining('first.gcode'),
      }),
    );
  });
});
