export type FileKind = 'gcode' | 'image' | 'binary' | 'log' | 'model' | 'archive';

export interface FileTreeNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  kind?: FileKind;
  children?: FileTreeNode[];
}

export interface PinnedLocation {
  id: string;
  label: string;
  path: string;
  icon: string;
}

export interface FileMetadata {
  layers?: number;
  filamentDensity?: string;
  filamentDiameter?: string;
  dimensions?: string;
  filamentLength?: string;
  filamentCost?: string;
  estimatedTime?: string;
  printingTimeModel?: string;
}

export interface FileListItem {
  id: string;
  name: string;
  path: string;
  kind: FileKind;
  extension: string;
  size: string;
  modifiedAt: string;
  thumbnailUrl?: string;
  metadata: FileMetadata;
}

export interface FilesDashboardData {
  pinnedLocations: PinnedLocation[];
  tree: FileTreeNode[];
  files: FileListItem[];
  initialFolderPath: string;
  uploadPath: string;
}
