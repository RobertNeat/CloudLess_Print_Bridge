import { Injectable, signal } from '@angular/core';

export type FilesDashboardLayout = 'balanced' | 'browser-wide' | 'details-wide' | 'reversed';
const STORAGE_KEY = 'octo-files-dashboard-layout-v1';

@Injectable({ providedIn: 'root' })
export class FilesDashboardLayoutService {
  readonly layout = signal<FilesDashboardLayout>(this.restore());

  set(layout: FilesDashboardLayout): void {
    this.layout.set(layout);
    globalThis.localStorage?.setItem(STORAGE_KEY, layout);
  }

  reset(): void {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
    this.layout.set('balanced');
  }

  private restore(): FilesDashboardLayout {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value === 'browser-wide' || value === 'details-wide' || value === 'reversed'
      ? value
      : 'balanced';
  }
}
