import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RemoteEntryDto } from '@cloudless/printer-contracts';
import type { FilesRepositoryPort, FolderContents } from '../files-dashboard.ports';
import type { FileListItem, FileTreeNode, FilesDashboardData } from '../files-dashboard.models';
import { extensionFromName, fileKindFromExtension } from '../file-kind.util';
import { FtpsRemoteManagerConfig } from './ftps-remote-manager.config';

const ROOT_PATH = '/';

/**
 * Real FilesRepositoryPort implementation backed by ftps-remote-manager.
 *
 * The backend only lists one directory at a time (`GET /files?path=`), so
 * `load()` eagerly fetches the root and, for every folder found there, that
 * folder's own contents too (one level deep) -- see fetchRootAndChildren().
 * Anything deeper is left with `children: undefined` so file-tree.ts (Task
 * 4) can tell "not loaded yet" apart from "loaded and empty" and fetch it
 * on demand via loadFolder().
 *
 * The backend has no concept of pinned locations (that's a pure dashboard
 * UI notion), so pinnedLocations is always empty here rather than fabricated.
 */
@Injectable({ providedIn: 'root' })
export class HttpFilesDataService implements FilesRepositoryPort {
  private readonly http = inject(HttpClient);
  private readonly config = inject(FtpsRemoteManagerConfig);

  async load(): Promise<FilesDashboardData> {
    const { tree, files } = await this.fetchRootAndChildren();

    return {
      pinnedLocations: [],
      tree,
      files,
      initialFolderPath: ROOT_PATH,
      uploadPath: ROOT_PATH,
    };
  }

  async loadFolder(path: string): Promise<FolderContents> {
    const entries = await this.fetchDirectory(path);
    return {
      children: entries.map((entry) => this.mapNode(entry, undefined)),
      files: entries
        .filter((entry) => entry.type !== 'directory')
        .map((entry) => this.mapFile(entry)),
    };
  }

  private async fetchRootAndChildren(): Promise<{ tree: FileTreeNode[]; files: FileListItem[] }> {
    const rootEntries = await this.fetchDirectory(ROOT_PATH);
    const rootFolders = rootEntries.filter((entry) => entry.type === 'directory');

    // A subfolder that fails here (permissions, transient error) just stays
    // unexpanded -- children: undefined already means "not loaded", so
    // Task 4's lazy expand can simply retry it later. Only the root listing
    // itself is allowed to fail the whole load, same as HttpVideosDataService.
    const childListings = await Promise.all(
      rootFolders.map(async (folder) => {
        try {
          return { path: folder.path, entries: await this.fetchDirectory(folder.path) };
        } catch {
          return { path: folder.path, entries: undefined };
        }
      }),
    );
    const childrenByPath = new Map(childListings.map((listing) => [listing.path, listing.entries]));

    const tree = rootEntries.map((entry) => {
      const children = entry.type === 'directory' ? childrenByPath.get(entry.path) : undefined;
      return this.mapNode(
        entry,
        children?.map((child) => this.mapNode(child, undefined)),
      );
    });

    const files = [
      ...rootEntries
        .filter((entry) => entry.type !== 'directory')
        .map((entry) => this.mapFile(entry)),
      ...childListings.flatMap((listing) =>
        (listing.entries ?? [])
          .filter((entry) => entry.type !== 'directory')
          .map((entry) => this.mapFile(entry)),
      ),
    ];

    return { tree, files };
  }

  private async fetchDirectory(path: string): Promise<RemoteEntryDto[]> {
    return firstValueFrom(
      this.http.get<RemoteEntryDto[]>(`${this.config.baseUrl}/files`, { params: { path } }),
    );
  }

  private mapNode(entry: RemoteEntryDto, children: FileTreeNode[] | undefined): FileTreeNode {
    return {
      // RemoteEntryDto has no id field; its path is unique and stable within
      // the remote filesystem, so it doubles as the node id.
      id: entry.path,
      name: entry.name,
      // FileTreeNode only distinguishes folder/file, but the backend also
      // reports symbolic-link and unknown entry types. Anything that isn't
      // explicitly a directory is treated as a file for tree/list purposes
      // rather than adding a third UI state for a handful of edge-case entries.
      type: entry.type === 'directory' ? 'folder' : 'file',
      path: entry.path,
      kind: entry.type === 'directory' ? undefined : fileKindFromExtension(entry.name),
      children,
    };
  }

  private mapFile(entry: RemoteEntryDto): FileListItem {
    return {
      id: entry.path,
      name: entry.name,
      path: entry.path,
      kind: fileKindFromExtension(entry.name),
      extension: extensionFromName(entry.name),
      sizeBytes: entry.size,
      // modifiedAt is optional on the backend DTO but required here; an
      // empty string is an honest "unknown", never a fabricated timestamp.
      modifiedAt: entry.modifiedAt ?? '',
      metadata: {},
    };
  }
}
