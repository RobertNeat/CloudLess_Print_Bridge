import type { TranslationKey } from '../core/i18n.service';

export type FileKind = 'gcode' | 'image' | 'binary' | 'log' | 'model' | 'archive';
export type FileAction = 'download' | 'rename' | 'move' | 'delete';

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
  labelKey: TranslationKey;
  path: string;
  icon: string;
}

export interface FileDimensions {
  x: number;
  y: number;
  z: number;
}

export interface FileMetadata {
  layers?: number;
  filamentDensityGcm3?: number;
  filamentDiameterMm?: number;
  dimensionsMm?: FileDimensions;
  filamentLengthM?: number;
  filamentCost?: number;
  filamentCostCurrency?: string;
  estimatedTimeSeconds?: number;
  printingTimeModel?: string;
}

export interface FileListItem {
  id: string;
  name: string;
  path: string;
  kind: FileKind;
  extension: string;
  sizeBytes: number;
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
