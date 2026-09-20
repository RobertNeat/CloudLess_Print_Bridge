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
  /** On-demand fetch of one folder's direct children, for lazy tree expansion -- `load()` only fetches the root listing. */
  loadFolder(path: string): Promise<FolderContents>;
  /** Recursively walks every folder from `rootPath` down, for the move dialog's destination picker -- the lazily-loaded tree may not have every folder fetched yet. */
  listAllFolders(rootPath: string): Promise<string[]>;
}

export interface FilesOperationsPort {
  // `destination` is required for 'rename' (the new filename) and 'move'
  // (the destination directory); unused for 'delete'. The page collects it
  // via a prompt before calling execute, since FileListItem alone never
  // carries a target location.
  execute(action: FileAction, file: FileListItem, destination?: string): Promise<'ok' | 'error'>;
  upload(path: string, file: File, force?: boolean): Promise<'ok' | 'conflict' | 'error'>;
  // Downloading isn't a mutating operation like rename/move/delete, so it gets
  // its own method instead of another FileAction branch inside execute().
  download(file: FileListItem): Promise<void>;
}

export const FILES_REPOSITORY = new InjectionToken<FilesRepositoryPort>('FILES_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(FilesDashboardDataService),
});

@Injectable({ providedIn: 'root' })
export class DevelopmentFilesOperationsAdapter implements FilesOperationsPort {
  // No backend is wired for this dev stub, so every call is honestly reported
  // as a failure rather than a fabricated success.
  async execute(
    _action: FileAction,
    _file: FileListItem,
    _destination?: string,
  ): Promise<'ok' | 'error'> {
    return 'error';
  }

  async upload(_path: string, _file: File, _force?: boolean): Promise<'ok' | 'conflict' | 'error'> {
    return 'error';
  }

  // No backend is wired for this dev stub; resolving immediately is the
  // honest no-op since there is nothing to fetch and nothing to save.
  async download(_file: FileListItem): Promise<void> {}
}

export const FILES_OPERATIONS = new InjectionToken<FilesOperationsPort>('FILES_OPERATIONS', {
  providedIn: 'root',
  factory: () => inject(DevelopmentFilesOperationsAdapter),
});
