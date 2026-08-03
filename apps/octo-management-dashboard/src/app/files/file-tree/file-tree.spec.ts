import { TestBed } from '@angular/core/testing';
import type { FileTreeNode } from '../files-dashboard.models';
import { FileTree } from './file-tree';

const fileNode: FileTreeNode = {
  id: 'file',
  name: 'selected.gcode',
  type: 'file',
  path: '/home/selected.gcode',
};

describe('FileTree', () => {
  it('emits the exact file node instead of only its parent path', () => {
    const fixture = TestBed.createComponent(FileTree);
    fixture.componentRef.setInput('pinnedLocations', []);
    fixture.componentRef.setInput('nodes', [fileNode]);
    fixture.componentRef.setInput('selectedFolderPath', '/home');
    fixture.detectChanges();

    let selected: FileTreeNode | undefined;
    fixture.componentInstance.fileSelected.subscribe((node) => (selected = node));
    (fixture.nativeElement.querySelector('.tree-node') as HTMLButtonElement).click();

    expect(selected).toEqual(fileNode);
  });
});
