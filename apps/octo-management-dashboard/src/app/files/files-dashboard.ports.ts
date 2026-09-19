import { Injectable, InjectionToken, inject } from '@angular/core';
import { FilesDashboardDataService } from './files-dashboard-data.service';
import type {
  FileAction,
  FileListItem,
  FilesDashboardData,
  FileTreeNode,
} from './files-dashboard.models';

/** Direct children of one folder, as returned by a single-directory backend listing. */
export interface FolderContents {
  children: FileTreeNode[];
  files: FileListItem[];
}

export interface FilesRepositoryPort {
  load(): Promise<FilesDashboardData>;
  /** On-demand fetch of one folder's direct children, for lazy tree expansion beyond the levels `load()` already fetched eagerly. */
  loadFolder(path: string): Promise<FolderContents>;
}

export interface FilesOperationsPort {
  execute(action: FileAction, file: FileListItem): Promise<'ok' | 'error'>;
  upload(path: string, file: File): Promise<'ok' | 'conflict' | 'error'>;
}

export const FILES_REPOSITORY = new InjectionToken<FilesRepositoryPort>('FILES_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(FilesDashboardDataService),
});

@Injectable({ providedIn: 'root' })
export class DevelopmentFilesOperationsAdapter implements FilesOperationsPort {
  // No backend is wired for this dev stub, so every call is honestly reported
  // as a failure rather than a fabricated success.
  async execute(_action: FileAction, _file: FileListItem): Promise<'ok' | 'error'> {
    return 'error';
  }

  async upload(_path: string, _file: File): Promise<'ok' | 'conflict' | 'error'> {
    return 'error';
  }
}

export const FILES_OPERATIONS = new InjectionToken<FilesOperationsPort>('FILES_OPERATIONS', {
  providedIn: 'root',
  factory: () => inject(DevelopmentFilesOperationsAdapter),
});
