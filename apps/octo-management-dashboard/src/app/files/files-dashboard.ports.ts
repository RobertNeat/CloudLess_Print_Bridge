import { Injectable, InjectionToken, inject } from '@angular/core';
import { FilesDashboardDataService } from './files-dashboard-data.service';
import type { FileAction, FileListItem, FilesDashboardData } from './files-dashboard.models';

export interface FilesRepositoryPort {
  load(): Promise<FilesDashboardData>;
}

export interface FilesOperationsPort {
  execute(action: FileAction, file: FileListItem): Promise<'not-configured'>;
  upload(path: string): Promise<'not-configured'>;
}

export const FILES_REPOSITORY = new InjectionToken<FilesRepositoryPort>('FILES_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(FilesDashboardDataService),
});

@Injectable({ providedIn: 'root' })
export class DevelopmentFilesOperationsAdapter implements FilesOperationsPort {
  async execute(_action: FileAction, _file: FileListItem): Promise<'not-configured'> {
    return 'not-configured';
  }

  async upload(_path: string): Promise<'not-configured'> {
    return 'not-configured';
  }
}

export const FILES_OPERATIONS = new InjectionToken<FilesOperationsPort>('FILES_OPERATIONS', {
  providedIn: 'root',
  factory: () => inject(DevelopmentFilesOperationsAdapter),
});
