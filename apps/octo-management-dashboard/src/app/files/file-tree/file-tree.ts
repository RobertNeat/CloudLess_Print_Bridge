import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
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
  /** Paths whose loadFolder() fetch most recently failed, so a stuck spinner can clear and the user can retry by expanding again. */
  readonly failedPaths = input<ReadonlySet<string>>(new Set());
  readonly folderSelected = output<string>();
  readonly fileSelected = output<FileTreeNode>();
  /** Emitted when the user expands a folder whose `children` is `undefined` (not loaded yet); the page owns fetching it via loadFolder(). */
  readonly folderExpandRequested = output<FileTreeNode>();
  private readonly collapsedIds = signal<ReadonlySet<string>>(new Set());
  // Loading state is local UI presentation, not something the page needs to
  // track per node -- it only needs to know "fetch this path". Cleared
  // whenever the node's `children` input actually changes (see expand()).
  private readonly loadingIds = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // A node's `children` arrives via the `nodes` input (new array/object
    // identity, per the page's immutable tree patch). Once any pending node
    // shows up loaded (or errors out and stays undefined -- checked again on
    // the next input change is harmless), clear its loading spinner here
    // rather than requiring the page to signal back per node.
    effect(() => {
      const pending = this.loadingIds();
      if (pending.size === 0) return;
      const failed = this.failedPaths();
      const settledNow = new Set<string>();
      const visit = (nodes: FileTreeNode[]): void => {
        for (const node of nodes) {
          if (pending.has(node.id) && (Array.isArray(node.children) || failed.has(node.path))) {
            settledNow.add(node.id);
          }
          if (node.children) visit(node.children);
        }
      };
      visit(this.nodes());
      if (settledNow.size === 0) return;
      this.loadingIds.update((current) => {
        const next = new Set(current);
        settledNow.forEach((id) => next.delete(id));
        return next;
      });
    });
  }

  protected selectPinned(path: string): void {
    this.folderSelected.emit(path);
  }

  protected select(node: FileTreeNode): void {
    if (node.type === 'folder') {
      this.folderSelected.emit(node.path);
      this.toggle(node);
      return;
    }
    this.fileSelected.emit(node);
  }

  protected isExpanded(node: FileTreeNode): boolean {
    return Array.isArray(node.children) && !this.collapsedIds().has(node.id);
  }

  protected isLoading(id: string): boolean {
    return this.loadingIds().has(id);
  }

  protected expand(node: FileTreeNode): void {
    if (!Array.isArray(node.children)) {
      // Not loaded yet: ask the page to fetch it rather than toggling local
      // state. Do NOT add/remove from collapsedIds here -- once children
      // arrive (input changes), isExpanded() should read true immediately
      // without ever having been marked collapsed.
      if (this.loadingIds().has(node.id)) return;
      this.loadingIds.update((current) => new Set(current).add(node.id));
      this.folderExpandRequested.emit(node);
      return;
    }
    this.collapsedIds.update((current) => {
      const next = new Set(current);
      next.delete(node.id);
      return next;
    });
  }

  protected collapse(node: FileTreeNode): void {
    if (!Array.isArray(node.children)) return;
    this.collapsedIds.update((current) => new Set(current).add(node.id));
  }

  private toggle(node: FileTreeNode): void {
    this.isExpanded(node) ? this.collapse(node) : this.expand(node);
  }
}
