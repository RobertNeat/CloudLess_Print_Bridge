import { Component, computed, inject, signal } from '@angular/core';
import { AccessPolicy, type Permission } from '../core/auth-session.service';
import { FilesDashboardLayoutService } from '../core/files-dashboard-layout.service';
import { I18nService, type TranslationKey } from '../core/i18n.service';
import { FileDetails } from './file-details/file-details';
import { FileList } from './file-list/file-list';
import { FileTree } from './file-tree/file-tree';
import { FILES_OPERATIONS, FILES_REPOSITORY } from './files-dashboard.ports';
import type {
  FileAction,
  FileListItem,
  FilesDashboardData,
  FileTreeNode,
} from './files-dashboard.models';

type OperationNotice =
  { readonly type: 'denied' } | { readonly type: 'unavailable'; readonly action?: FileAction };

@Component({
  selector: 'app-files-dashboard-page',
  imports: [FileDetails, FileList, FileTree],
  templateUrl: './files-dashboard-page.html',
  styleUrl: './files-dashboard-page.scss',
})
export class FilesDashboardPage {
  private readonly repository = inject(FILES_REPOSITORY);
  private readonly operations = inject(FILES_OPERATIONS);
  private readonly access = inject(AccessPolicy);
  protected readonly i18n = inject(I18nService);
  protected readonly layout = inject(FilesDashboardLayoutService);
  protected readonly dashboard = signal<FilesDashboardData | null>(null);
  protected readonly selectedFolderPath = signal('');
  protected readonly selectedFile = signal<FileListItem | null>(null);
  protected readonly loadingError = signal(false);
  protected readonly failedPaths = signal<ReadonlySet<string>>(new Set());
  private readonly operationNotice = signal<OperationNotice | null>(null);
  // Paths whose contents are already present in dashboard().files -- either
  // from the initial eager load() (root + its immediate subfolders) or from
  // a completed loadFolder() call. Lets filesForPath/selectFolder tell
  // "trust data.files" apart from "must fetch first" without re-deriving it
  // from tree shape on every call.
  private readonly loadedFolderPaths = new Set<string>();
  // Fetches already in flight, keyed by path, so a folder clicked in both
  // the tree (expand) and the list/pinned (select) in the same tick -- or
  // double-clicked -- only triggers one loadFolder() call.
  private readonly pendingFolderPaths = new Set<string>();

  protected readonly operationMessage = computed(() => {
    const notice = this.operationNotice();
    if (!notice) return '';
    if (notice.type === 'denied') return this.i18n.t('files.operationDenied');
    if (!notice.action) return this.i18n.t('files.uploadUnavailable');
    return this.i18n.t('files.operationUnavailable', {
      action: this.i18n.t(this.actionLabelKey(notice.action)),
    });
  });

  protected readonly visibleFiles = computed(() => {
    const data = this.dashboard();
    if (!data) return [];
    return this.filesForPath(this.selectedFolderPath(), data);
  });

  constructor() {
    void this.loadData();
  }

  protected selectFolder(folderPath: string): void {
    const data = this.dashboard();
    if (!data) return;
    this.selectedFolderPath.set(folderPath);
    this.selectedFile.set(this.filesForPath(folderPath, data)[0] ?? null);

    // Selecting a folder (pinned location, or clicking its label in the
    // tree) must show its files in the list panel even if the tree itself
    // was never expanded down to it -- expand and select are independent.
    void this.ensureFolderLoaded(folderPath);
  }

  protected selectFileNode(node: FileTreeNode): void {
    const data = this.dashboard();
    if (!data) return;
    this.selectedFolderPath.set(this.parentPath(node.path));
    this.selectedFile.set(data.files.find((candidate) => candidate.path === node.path) ?? null);
  }

  protected async handleFolderExpandRequested(node: FileTreeNode): Promise<void> {
    const data = this.dashboard();
    if (!data) return;
    const contents = await this.fetchFolder(node.path);
    if (!contents) return;

    this.dashboard.set({
      ...data,
      tree: this.patchTreeChildren(data.tree, node.path, contents.children),
      files: this.mergeFiles(data.files, contents.files),
    });
    if (this.selectedFolderPath() === node.path) {
      this.selectedFile.set(contents.files[0] ?? null);
    }
  }

  private async ensureFolderLoaded(folderPath: string): Promise<void> {
    if (this.loadedFolderPaths.has(folderPath) || this.pendingFolderPaths.has(folderPath)) return;
    const contents = await this.fetchFolder(folderPath);
    const data = this.dashboard();
    if (!contents || !data) return;

    this.dashboard.set({
      ...data,
      tree: this.patchTreeChildren(data.tree, folderPath, contents.children),
      files: this.mergeFiles(data.files, contents.files),
    });
    if (this.selectedFolderPath() === folderPath) {
      this.selectedFile.set(this.filesForPath(folderPath, this.dashboard()!)[0] ?? null);
    }
  }

  private async fetchFolder(path: string): Promise<{
    readonly children: FileTreeNode[];
    readonly files: FileListItem[];
  } | null> {
    this.pendingFolderPaths.add(path);
    try {
      const contents = await this.repository.loadFolder(path);
      this.loadedFolderPaths.add(path);
      this.failedPaths.update((current) => {
        if (!current.has(path)) return current;
        const next = new Set(current);
        next.delete(path);
        return next;
      });
      return contents;
    } catch {
      this.failedPaths.update((current) => new Set(current).add(path));
      return null;
    } finally {
      this.pendingFolderPaths.delete(path);
    }
  }

  private patchTreeChildren(
    nodes: FileTreeNode[],
    targetPath: string,
    children: FileTreeNode[],
  ): FileTreeNode[] {
    return nodes.map((node) => {
      if (node.path === targetPath) return { ...node, children };
      if (node.children) {
        return { ...node, children: this.patchTreeChildren(node.children, targetPath, children) };
      }
      return node;
    });
  }

  private mergeFiles(existing: FileListItem[], incoming: FileListItem[]): FileListItem[] {
    // Dedup by path: it's the stable id per Task 3 (backend entries have no
    // separate id field). Existing entries win so an in-flight mutation
    // elsewhere isn't clobbered by a stale re-fetch of the same folder.
    const byPath = new Map(existing.map((file) => [file.path, file]));
    for (const file of incoming) {
      if (!byPath.has(file.path)) byPath.set(file.path, file);
    }
    return Array.from(byPath.values());
  }

  private parentPath(path: string): string {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash <= 0) return '/';
    return path.substring(0, lastSlash);
  }

  protected async executeFileAction(request: {
    readonly action: FileAction;
    readonly file: FileListItem;
  }): Promise<void> {
    if (!this.access.can(this.permissionForAction(request.action))) {
      this.operationNotice.set({ type: 'denied' });
      return;
    }

    const result = await this.operations.execute(request.action, request.file);
    // Reloading/patching the file list after a successful mutation is deferred
    // to a later task; only surface a notice for the failure path for now.
    if (result === 'error') {
      this.operationNotice.set({ type: 'unavailable', action: request.action });
    }
  }

  protected async requestUpload(): Promise<void> {
    if (!this.access.can('files.upload')) {
      this.operationNotice.set({ type: 'denied' });
      return;
    }

    // UploadZone's `uploadRequested` output carries no File payload yet — the
    // file-picker/drop wiring that produces a real File lands in a later task.
    // Until then there is nothing to upload, so this stays a stub notice
    // rather than calling `operations.upload` with a fabricated File.
    this.operationNotice.set({ type: 'unavailable' });
  }

  private async loadData(): Promise<void> {
    try {
      const data = await this.repository.load();
      this.dashboard.set(data);
      this.seedLoadedFolderPaths(data.tree, data.initialFolderPath);
      this.selectedFolderPath.set(data.initialFolderPath);
      this.selectedFile.set(
        this.filesForPath(data.initialFolderPath, data)[0] ?? data.files[0] ?? null,
      );
    } catch {
      this.loadingError.set(true);
    }
  }

  private seedLoadedFolderPaths(nodes: FileTreeNode[], rootPath: string): void {
    // Derived from the children!==undefined invariant itself (not from "root
    // is depth 0, its folders are depth 1") -- Task 3's adapter leaves a root
    // subfolder at children:undefined when ITS fetch failed, and that must
    // stay eligible for a retry via ensureFolderLoaded, not get marked loaded.
    this.loadedFolderPaths.add(rootPath);
    for (const node of nodes) {
      if (node.type === 'folder' && Array.isArray(node.children)) {
        this.loadedFolderPaths.add(node.path);
      }
    }
  }

  private filesForPath(path: string, data: FilesDashboardData): FileListItem[] {
    return data.files.filter((file) => this.parentPath(file.path) === path);
  }

  private permissionForAction(action: FileAction): Permission {
    return action === 'download' ? 'files.download' : 'files.manage';
  }

  private actionLabelKey(action: FileAction): TranslationKey {
    const keys: Record<FileAction, TranslationKey> = {
      download: 'files.actions.download',
      rename: 'files.actions.rename',
      move: 'files.actions.move',
      delete: 'files.actions.delete',
    };
    return keys[action];
  }
}
