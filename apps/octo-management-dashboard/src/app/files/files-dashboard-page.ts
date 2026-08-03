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
  private readonly operationNotice = signal<OperationNotice | null>(null);

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
  }

  protected selectFileNode(node: FileTreeNode): void {
    const data = this.dashboard();
    if (!data) return;
    this.selectedFolderPath.set(node.path.substring(0, node.path.lastIndexOf('/')));
    this.selectedFile.set(data.files.find((candidate) => candidate.path === node.path) ?? null);
  }

  protected async executeFileAction(request: {
    readonly action: FileAction;
    readonly file: FileListItem;
  }): Promise<void> {
    if (!this.access.can(this.permissionForAction(request.action))) {
      this.operationNotice.set({ type: 'denied' });
      return;
    }

    await this.operations.execute(request.action, request.file);
    this.operationNotice.set({ type: 'unavailable', action: request.action });
  }

  protected async requestUpload(): Promise<void> {
    if (!this.access.can('files.upload')) {
      this.operationNotice.set({ type: 'denied' });
      return;
    }

    await this.operations.upload(this.selectedFolderPath());
    this.operationNotice.set({ type: 'unavailable' });
  }

  private async loadData(): Promise<void> {
    try {
      const data = await this.repository.load();
      this.dashboard.set(data);
      this.selectedFolderPath.set(data.initialFolderPath);
      this.selectedFile.set(
        this.filesForPath(data.initialFolderPath, data)[0] ?? data.files[0] ?? null,
      );
    } catch {
      this.loadingError.set(true);
    }
  }

  private filesForPath(path: string, data: FilesDashboardData): FileListItem[] {
    const exact = data.files.filter(
      (file) => file.path.substring(0, file.path.lastIndexOf('/')) === path,
    );
    return exact.length ? exact : data.files.filter((file) => file.path.startsWith(path + '/'));
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
