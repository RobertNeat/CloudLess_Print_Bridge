import { Injectable, signal } from '@angular/core';

export type FilesBrowserWidth = 'standard' | 'wide' | 'maximum';
export type FilesDetailsPosition = 'right' | 'left';

const WIDTH_STORAGE_KEY = 'octo-files-browser-width-v2';
const POSITION_STORAGE_KEY = 'octo-files-details-position-v2';
const LEGACY_STORAGE_KEY = 'octo-files-dashboard-layout-v1';

@Injectable({ providedIn: 'root' })
export class FilesDashboardLayoutService {
  readonly browserWidth = signal<FilesBrowserWidth>(this.restoreWidth());
  readonly detailsPosition = signal<FilesDetailsPosition>(this.restorePosition());

  setBrowserWidth(width: FilesBrowserWidth): void {
    this.browserWidth.set(width);
    globalThis.localStorage?.setItem(WIDTH_STORAGE_KEY, width);
  }

  setDetailsPosition(position: FilesDetailsPosition): void {
    this.detailsPosition.set(position);
    globalThis.localStorage?.setItem(POSITION_STORAGE_KEY, position);
  }

  reset(): void {
    globalThis.localStorage?.removeItem(WIDTH_STORAGE_KEY);
    globalThis.localStorage?.removeItem(POSITION_STORAGE_KEY);
    globalThis.localStorage?.removeItem(LEGACY_STORAGE_KEY);
    this.browserWidth.set('standard');
    this.detailsPosition.set('right');
  }

  private restoreWidth(): FilesBrowserWidth {
    const value = globalThis.localStorage?.getItem(WIDTH_STORAGE_KEY);
    if (value === 'wide' || value === 'maximum') return value;
    if (value === 'standard') return value;

    return globalThis.localStorage?.getItem(LEGACY_STORAGE_KEY) === 'browser-wide'
      ? 'wide'
      : 'standard';
  }

  private restorePosition(): FilesDetailsPosition {
    const value = globalThis.localStorage?.getItem(POSITION_STORAGE_KEY);
    if (value === 'left' || value === 'right') return value;

    return globalThis.localStorage?.getItem(LEGACY_STORAGE_KEY) === 'reversed' ? 'left' : 'right';
  }
}
