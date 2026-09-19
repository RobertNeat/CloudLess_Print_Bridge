import { TestBed } from '@angular/core/testing';
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
        { provide: FILES_REPOSITORY, useValue: { load: async () => data } },
        {
          provide: FILES_OPERATIONS,
          useValue: {
            execute: async () => 'not-configured' as const,
            upload: async () => 'not-configured' as const,
            download: async () => {},
          },
        },
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
});
