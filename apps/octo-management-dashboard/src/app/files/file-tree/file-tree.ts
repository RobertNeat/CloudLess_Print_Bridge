import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { I18nService } from '../../core/i18n.service';
import type { FileTreeNode, PinnedLocation } from '../files-dashboard.models';

@Component({
  selector: 'app-file-tree',
  imports: [NgTemplateOutlet],
  templateUrl: './file-tree.html',
  styleUrl: './file-tree.scss',
})
export class FileTree {
  protected readonly i18n = inject(I18nService);
  readonly pinnedLocations = input.required<PinnedLocation[]>();
  readonly nodes = input.required<FileTreeNode[]>();
  readonly selectedFolderPath = input.required<string>();
  readonly selectedFilePath = input<string | null>(null);
  readonly folderSelected = output<string>();
  readonly fileSelected = output<FileTreeNode>();
  private readonly collapsedIds = signal<ReadonlySet<string>>(new Set());

  protected selectPinned(path: string): void {
    this.folderSelected.emit(path);
  }

  protected select(node: FileTreeNode): void {
    if (node.type === 'folder') {
      this.folderSelected.emit(node.path);
      this.toggle(node.id);
      return;
    }
    this.fileSelected.emit(node);
  }

  protected isExpanded(id: string): boolean {
    return !this.collapsedIds().has(id);
  }

  protected expand(id: string): void {
    this.collapsedIds.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  protected collapse(id: string): void {
    this.collapsedIds.update((current) => new Set(current).add(id));
  }

  private toggle(id: string): void {
    this.isExpanded(id) ? this.collapse(id) : this.expand(id);
  }
}
