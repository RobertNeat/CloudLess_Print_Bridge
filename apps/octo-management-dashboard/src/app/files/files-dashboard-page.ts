import { Component, computed, inject, signal } from '@angular/core';
import { FilesDashboardLayoutService } from '../core/files-dashboard-layout.service';
import { FileDetails } from './file-details/file-details';
import { FileList } from './file-list/file-list';
import { FileTree } from './file-tree/file-tree';
import { FilesDashboardDataService } from './files-dashboard-data.service';
import type { FileListItem, FilesDashboardData } from './files-dashboard.models';

@Component({
  selector: 'app-files-dashboard-page',
  imports: [FileDetails, FileList, FileTree],
  templateUrl: './files-dashboard-page.html',
  styleUrl: './files-dashboard-page.scss',
})
export class FilesDashboardPage {
  private readonly dataService = inject(FilesDashboardDataService);
  protected readonly layout = inject(FilesDashboardLayoutService);
  protected readonly dashboard = signal<FilesDashboardData | null>(null);
  protected readonly selectedFolderPath = signal('');
  protected readonly selectedFile = signal<FileListItem | null>(null);
  protected readonly loadingError = signal(false);

  protected readonly visibleFiles = computed(() => {
    const data = this.dashboard();
    if (!data) return [];
    return this.filesForPath(this.selectedFolderPath(), data);
  });

  constructor() {
    void this.loadData();
  }

  protected selectFolder(path: string): void {
    const data = this.dashboard();
    if (!data) return;
    const folderPath = data.files.some((file) => file.path === path)
      ? path.substring(0, path.lastIndexOf('/'))
      : path;
    this.selectedFolderPath.set(folderPath);
    this.selectedFile.set(this.filesForPath(folderPath, data)[0] ?? null);
  }

  private async loadData(): Promise<void> {
    try {
      const data = await this.dataService.load();
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
}
