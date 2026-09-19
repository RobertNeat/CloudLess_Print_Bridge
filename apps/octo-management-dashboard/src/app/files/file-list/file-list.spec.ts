import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/i18n.service';
import type { FileListItem } from '../files-dashboard.models';
import { FileList } from './file-list';

const files: FileListItem[] = [
  {
    id: 'one',
    name: 'one.gcode',
    path: '/home/one.gcode',
    kind: 'gcode',
    extension: 'gcode',
    sizeBytes: 1024,
    modifiedAt: '2026-08-03T10:00:00+02:00',
    metadata: {},
  },
];

const filesWithMissingModifiedAt: FileListItem[] = [
  ...files,
  {
    id: 'two',
    name: 'two.gcode',
    path: '/home/two.gcode',
    kind: 'gcode',
    extension: 'gcode',
    sizeBytes: 2048,
    modifiedAt: '',
    metadata: {},
  },
];

describe('FileList', () => {
  it('reacts to language changes and exposes a separate action menu button', () => {
    const fixture = TestBed.createComponent(FileList);
    fixture.componentRef.setInput('files', files);
    fixture.componentRef.setInput('path', '/home');
    const i18n = TestBed.inject(I18nService);

    i18n.language.set('en');
    fixture.detectChanges();
    let element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('1 file');
    expect(element.querySelector('input')?.placeholder).toBe('Search this folder');
    expect(element.querySelector('[aria-label="Open actions for one.gcode"]')).toBeTruthy();

    i18n.language.set('pl');
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('1 plik');
    expect(element.querySelector('input')?.placeholder).toBe('Szukaj w folderze');
  });

  it('renders a row with an empty modifiedAt instead of throwing', () => {
    const fixture = TestBed.createComponent(FileList);
    fixture.componentRef.setInput('files', filesWithMissingModifiedAt);
    fixture.componentRef.setInput('path', '/home');

    expect(() => fixture.detectChanges()).not.toThrow();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('two.gcode');
    expect(element.textContent).toContain('—');
  });
});
