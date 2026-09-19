import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
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
  | { readonly type: 'denied' }
  | { readonly type: 'unavailable'; readonly action?: FileAction }
  | { readonly type: 'succeeded'; readonly action: FileAction }
  | { readonly type: 'upload-succeeded' };

// Drives the inline rename/move prompt (single p-dialog, mode decides the
// title/label/target and how the confirm handler resolves it).
type DestinationPrompt = {
  readonly action: 'rename' | 'move';
  readonly file: FileListItem;
};

// Drives the inline upload-overwrite confirmation once upload() returns 'conflict'.
type UploadConflict = {
  readonly path: string;
  readonly file: File;
};

// Drives the upload-destination prompt shown before an upload actually
// happens, so the target folder is an explicit choice from the same real
// directory list the move dialog uses, not just "whatever folder is open".
type UploadPrompt = {
  readonly file: File;
};

// A move-destination option, as shown in the directory picker. `path` is the
// real absolute path sent to the backend; `label` is a friendlier
// trailing-slash form matching how the user thinks about folders.
interface DirectoryOption {
  readonly path: string;
  readonly label: string;
}

@Component({
  selector: 'app-files-dashboard-page',
  imports: [
    ButtonModule,
    DialogModule,
    FileDetails,
    FileList,
    FileTree,
    FormsModule,
    InputTextModule,
    SelectModule,
  ],
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
  protected readonly destinationPrompt = signal<DestinationPrompt | null>(null);
  protected readonly destinationInput = signal('');
  // Shared between the move and upload destination pickers: both are backed
  // by the same cached repository.listAllFolders() list, so one options/
  // loading pair is enough -- only the currently-selected path differs.
  protected readonly destinationOptions = signal<DirectoryOption[]>([]);
  protected readonly destinationsLoading = signal(false);
  protected readonly moveDestinationPath = signal('');
  protected readonly uploadConflict = signal<UploadConflict | null>(null);
  protected readonly uploadPrompt = signal<UploadPrompt | null>(null);
  protected readonly uploadDestinationPath = signal('');
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
    if (notice.type === 'upload-succeeded') return this.i18n.t('files.uploadSucceeded');
    // Download success needs no message (the browser's own save UI is the
    // feedback); delete/rename/move show a short confirmation while
    // refreshFoldersAfterMutation() refreshes the affected list in the background.
    if (notice.type === 'succeeded') {
      return notice.action === 'download'
        ? ''
        : this.i18n.t('files.operationSucceeded', {
            action: this.i18n.t(this.actionLabelKey(notice.action)),
          });
    }
    if (!notice.action) return this.i18n.t('files.uploadUnavailable');
    if (notice.action === 'download') return this.i18n.t('files.downloadFailed');
    return this.i18n.t('files.operationUnavailable', {
      action: this.i18n.t(this.actionLabelKey(notice.action)),
    });
  });

  protected readonly destinationPromptTitleKey = computed<TranslationKey>(() =>
    this.destinationPrompt()?.action === 'move'
      ? 'files.movePromptTitle'
      : 'files.renamePromptTitle',
  );

  protected readonly destinationPromptLabelKey = computed<TranslationKey>(() =>
    this.destinationPrompt()?.action === 'move'
      ? 'files.movePromptLabel'
      : 'files.renamePromptLabel',
  );

  protected readonly canConfirmDestinationPrompt = computed(() => {
    const prompt = this.destinationPrompt();
    if (!prompt) return false;
    if (prompt.action === 'rename') return true;
    return !this.destinationsLoading() && !!this.moveDestinationPath();
  });

  protected readonly canConfirmUploadPrompt = computed(
    () => !this.destinationsLoading() && !!this.uploadDestinationPath(),
  );

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
    } catch (error) {
      console.error(`[files] failed to load folder "${path}":`, error);
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
    // Root's own children ARE the top-level tree array (repository.load()
    // never emits a node whose path equals initialFolderPath itself), so
    // patching root means replacing the array wholesale, not finding a node.
    if (targetPath === this.dashboard()?.initialFolderPath) return children;
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

  // Unlike mergeFiles' "existing wins" dedup (used for expand, where nothing
  // was removed remotely), a post-mutation refresh must let the fresh fetch
  // win outright -- otherwise a deleted file's stale entry would survive
  // because mergeFiles never drops paths that are simply absent from `incoming`.
  private replaceFolderFiles(
    existing: FileListItem[],
    folderPath: string,
    incoming: FileListItem[],
  ): FileListItem[] {
    return [...existing.filter((file) => this.parentPath(file.path) !== folderPath), ...incoming];
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

    if (request.action === 'download') {
      try {
        await this.operations.download(request.file);
        this.operationNotice.set({ type: 'succeeded', action: 'download' });
      } catch {
        this.operationNotice.set({ type: 'unavailable', action: 'download' });
      }
      return;
    }

    if (request.action === 'rename') {
      this.destinationInput.set(request.file.name);
      this.destinationPrompt.set({ action: 'rename', file: request.file });
      return;
    }

    if (request.action === 'move') {
      this.destinationPrompt.set({ action: 'move', file: request.file });
      this.moveDestinationPath.set('');
      this.destinationOptions.set([]);
      void this.loadDestinationOptions(this.parentPath(request.file.path), this.moveDestinationPath);
      return;
    }

    // 'delete' needs no extra input, so it runs immediately.
    const result = await this.operations.execute(request.action, request.file);
    this.operationNotice.set(
      result === 'error'
        ? { type: 'unavailable', action: request.action }
        : { type: 'succeeded', action: request.action },
    );
    if (result === 'ok') {
      await this.refreshFoldersAfterMutation(request.file);
    }
  }

  // Fetches every folder on the remote filesystem so the move/upload dialogs
  // can offer a destination the user hasn't necessarily browsed to yet (the
  // client-side tree is only ever partially loaded, per its lazy-expand
  // design) -- a free-text path is what let ./logger-style typos and
  // relative-looking input reach the backend as an invalid destination.
  // Shared by both dialogs: repository.listAllFolders() is cached by the
  // adapter itself, so calling it from either picker never re-triggers a
  // slow walk once either one has fetched it this session.
  private async loadDestinationOptions(
    preferredPath: string,
    selection: { set(path: string): void },
  ): Promise<void> {
    this.destinationsLoading.set(true);
    try {
      const rootPath = this.dashboard()?.initialFolderPath ?? '/';
      const folders = await this.repository.listAllFolders(rootPath);
      this.destinationOptions.set(
        folders.map((path) => ({ path, label: path === '/' ? '/' : `${path}/` })),
      );
      selection.set(folders.includes(preferredPath) ? preferredPath : '');
    } catch (error) {
      console.error('[files] failed to load destination folders:', error);
      this.destinationOptions.set([]);
    } finally {
      this.destinationsLoading.set(false);
    }
  }

  protected async confirmDestinationPrompt(): Promise<void> {
    const prompt = this.destinationPrompt();
    if (!prompt) return;
    const destination =
      prompt.action === 'move' ? this.moveDestinationPath().trim() : this.destinationInput().trim();
    this.destinationPrompt.set(null);
    if (!destination) return;

    const result = await this.operations.execute(prompt.action, prompt.file, destination);
    this.operationNotice.set(
      result === 'error'
        ? { type: 'unavailable', action: prompt.action }
        : { type: 'succeeded', action: prompt.action },
    );
    if (result === 'ok') {
      await this.refreshFoldersAfterMutation(
        prompt.file,
        prompt.action === 'move' ? destination : undefined,
      );
    }
  }

  // Re-fetches the folder(s) touched by a completed rename/move/delete so the
  // list reflects reality immediately rather than only after a manual reload.
  // Only ensureFolderLoaded-eligible folders that are already loaded are worth
  // touching here -- the source folder always is (its file was visible to be
  // acted on), and a move's destination is only refreshed if the user has
  // already opened it, since pulling in data for an unopened folder has no
  // visible effect.
  private async refreshFoldersAfterMutation(
    file: FileListItem,
    destinationPath?: string,
  ): Promise<void> {
    const sourceFolder = this.parentPath(file.path);
    const foldersToRefresh = new Set([sourceFolder]);
    if (destinationPath && this.loadedFolderPaths.has(destinationPath)) {
      foldersToRefresh.add(destinationPath);
    }

    for (const folderPath of foldersToRefresh) {
      const contents = await this.fetchFolder(folderPath);
      const data = this.dashboard();
      if (!contents || !data) continue;

      this.dashboard.set({
        ...data,
        tree: this.patchTreeChildren(data.tree, folderPath, contents.children),
        files: this.replaceFolderFiles(data.files, folderPath, contents.files),
      });
    }

    const refreshedData = this.dashboard();
    if (!refreshedData) return;
    const selected = this.selectedFile();
    if (selected && !refreshedData.files.some((candidate) => candidate.path === selected.path)) {
      this.selectedFile.set(this.filesForPath(this.selectedFolderPath(), refreshedData)[0] ?? null);
    }
  }

  protected cancelDestinationPrompt(): void {
    this.destinationPrompt.set(null);
    this.destinationOptions.set([]);
    this.moveDestinationPath.set('');
  }

  protected requestUpload(file: File): void {
    if (!this.access.can('files.upload')) {
      this.operationNotice.set({ type: 'denied' });
      return;
    }

    this.uploadPrompt.set({ file });
    this.uploadDestinationPath.set('');
    this.destinationOptions.set([]);
    const preferredPath = this.selectedFolderPath() || this.dashboard()?.uploadPath || '/';
    void this.loadDestinationOptions(preferredPath, this.uploadDestinationPath);
  }

  protected async confirmUploadPrompt(): Promise<void> {
    const prompt = this.uploadPrompt();
    if (!prompt) return;
    const path = this.uploadDestinationPath().trim();
    this.uploadPrompt.set(null);
    if (!path) return;
    await this.performUpload(path, prompt.file, false);
  }

  protected cancelUploadPrompt(): void {
    this.uploadPrompt.set(null);
    this.destinationOptions.set([]);
    this.uploadDestinationPath.set('');
  }

  protected async confirmUploadOverwrite(): Promise<void> {
    const conflict = this.uploadConflict();
    this.uploadConflict.set(null);
    if (!conflict) return;
    await this.performUpload(conflict.path, conflict.file, true);
  }

  protected cancelUploadOverwrite(): void {
    this.uploadConflict.set(null);
  }

  private async performUpload(path: string, file: File, force: boolean): Promise<void> {
    const result = await this.operations.upload(path, file, force);
    if (result === 'conflict') {
      this.uploadConflict.set({ path, file });
      return;
    }
    this.operationNotice.set(
      result === 'error' ? { type: 'unavailable' } : { type: 'upload-succeeded' },
    );
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
    } catch (error) {
      console.error('[files] failed to load files dashboard data:', error);
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
