import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import type { FileListItem } from '../files-dashboard.models';

@Component({
  selector: 'app-file-list',
  imports: [FormsModule, InputTextModule],
  templateUrl: './file-list.html',
  styleUrl: './file-list.scss',
})
export class FileList {
  readonly files = input.required<FileListItem[]>();
  readonly selectedFileId = input<string | null>(null);
  readonly path = input.required<string>();
  readonly fileSelected = output<FileListItem>();
  protected query = '';
  protected sortAscending = true;

  protected visibleFiles(): FileListItem[] {
    const query = this.query.trim().toLocaleLowerCase();
    const files = query
      ? this.files().filter((file) => file.name.toLocaleLowerCase().includes(query))
      : this.files();
    return [...files].sort((left, right) => {
      const comparison = left.name.localeCompare(right.name, undefined, { numeric: true });
      return this.sortAscending ? comparison : -comparison;
    });
  }

  protected breadcrumbs(): string[] {
    return this.path().split('/').filter(Boolean);
  }

  protected fileIcon(file: FileListItem): string {
    if (file.kind === 'image') return 'pi pi-image';
    if (file.kind === 'archive') return 'pi pi-box';
    return 'pi pi-file';
  }
}
