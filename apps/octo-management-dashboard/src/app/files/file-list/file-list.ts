import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { MenuItem } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { I18nService, type TranslationKey } from '../../core/i18n.service';
import { fileKindIcon } from '../file-kind.util';
import type { FileAction, FileListItem } from '../files-dashboard.models';

@Component({
  selector: 'app-file-list',
  imports: [FormsModule, InputTextModule, MenuModule],
  templateUrl: './file-list.html',
  styleUrl: './file-list.scss',
})
export class FileList {
  protected readonly i18n = inject(I18nService);
  readonly files = input.required<FileListItem[]>();
  readonly selectedFileId = input<string | null>(null);
  readonly path = input.required<string>();
  readonly fileSelected = output<FileListItem>();
  readonly fileAction = output<{ readonly action: FileAction; readonly file: FileListItem }>();
  protected readonly query = signal('');
  protected readonly sortAscending = signal(true);
  protected readonly menuFile = signal<FileListItem | null>(null);

  protected readonly visibleFiles = computed(() => {
    const query = this.query().trim().toLocaleLowerCase(this.i18n.language());
    const files = query
      ? this.files().filter((file) =>
          file.name.toLocaleLowerCase(this.i18n.language()).includes(query),
        )
      : this.files();
    return [...files].sort((left, right) => {
      const comparison = left.name.localeCompare(right.name, this.i18n.language(), {
        numeric: true,
      });
      return this.sortAscending() ? comparison : -comparison;
    });
  });

  protected readonly fileMenuItems = computed<MenuItem[]>(() => [
    this.actionItem('download', 'pi pi-download'),
    this.actionItem('rename', 'pi pi-pencil'),
    this.actionItem('move', 'pi pi-folder-open'),
    { separator: true },
    this.actionItem('delete', 'pi pi-trash'),
  ]);

  protected breadcrumbs(): string[] {
    return this.path().split('/').filter(Boolean);
  }

  protected fileIcon(file: FileListItem): string {
    return fileKindIcon(file.kind);
  }

  protected fileCount(count: number): string {
    return this.i18n.plural(
      {
        one: 'files.count.one',
        few: 'files.count.few',
        many: 'files.count.many',
        other: 'files.count.other',
      },
      count,
    );
  }

  private actionItem(action: FileAction, icon: string): MenuItem {
    const labelKeys: Record<FileAction, TranslationKey> = {
      download: 'files.actions.download',
      rename: 'files.actions.rename',
      move: 'files.actions.move',
      delete: 'files.actions.delete',
    };
    return {
      label: this.i18n.t(labelKeys[action]),
      icon,
      styleClass: action === 'delete' ? 'file-action--danger' : undefined,
      command: () => {
        const file = this.menuFile();
        if (file) this.fileAction.emit({ action, file });
      },
    };
  }
}
