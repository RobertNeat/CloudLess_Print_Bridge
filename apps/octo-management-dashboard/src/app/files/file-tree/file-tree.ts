import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output } from '@angular/core';
import type { FileTreeNode, PinnedLocation } from '../files-dashboard.models';

@Component({
  selector: 'app-file-tree',
  imports: [NgTemplateOutlet],
  templateUrl: './file-tree.html',
  styleUrl: './file-tree.scss',
})
export class FileTree {
  readonly pinnedLocations = input.required<PinnedLocation[]>();
  readonly nodes = input.required<FileTreeNode[]>();
  readonly selectedPath = input.required<string>();
  readonly pathSelected = output<string>();

  protected select(path: string): void {
    this.pathSelected.emit(path);
  }
}
