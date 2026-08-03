import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  FileListItem,
  FileTreeNode,
  FilesDashboardData,
  PinnedLocation,
} from './files-dashboard.models';

@Injectable({ providedIn: 'root' })
export class FilesDashboardDataService {
  private readonly http = inject(HttpClient);

  async load(): Promise<FilesDashboardData> {
    const data: unknown = await firstValueFrom(
      this.http.get<unknown>('/mock-data/files-dashboard.json'),
    );
    if (!this.isFilesDashboardData(data)) {
      throw new Error('Mock files dashboard data has an invalid shape.');
    }
    return structuredClone(data);
  }

  private isFilesDashboardData(value: unknown): value is FilesDashboardData {
    if (!this.isRecord(value)) return false;
    const data = value as Partial<FilesDashboardData>;
    return (
      Array.isArray(data.pinnedLocations) &&
      data.pinnedLocations.every((item) => this.isPinnedLocation(item)) &&
      Array.isArray(data.tree) &&
      data.tree.every((node) => this.isTreeNode(node)) &&
      Array.isArray(data.files) &&
      data.files.every((file) => this.isFile(file)) &&
      typeof data.initialFolderPath === 'string' &&
      typeof data.uploadPath === 'string'
    );
  }

  private isPinnedLocation(value: unknown): value is PinnedLocation {
    if (!this.isRecord(value)) return false;
    return (
      ['id', 'path', 'icon'].every((key) => typeof value[key] === 'string') &&
      ['files.pinned.models', 'files.pinned.cache', 'files.pinned.logs'].includes(
        value['labelKey'] as string,
      )
    );
  }

  private isTreeNode(value: unknown): value is FileTreeNode {
    if (!this.isRecord(value)) return false;
    return (
      typeof value['id'] === 'string' &&
      typeof value['name'] === 'string' &&
      (value['type'] === 'folder' || value['type'] === 'file') &&
      typeof value['path'] === 'string' &&
      (value['children'] === undefined ||
        (Array.isArray(value['children']) &&
          value['children'].every((child) => this.isTreeNode(child))))
    );
  }

  private isFile(value: unknown): value is FileListItem {
    if (!this.isRecord(value) || !this.isRecord(value['metadata'])) return false;
    const metadata = value['metadata'];
    const optionalNumbers = [
      'layers',
      'filamentDensityGcm3',
      'filamentDiameterMm',
      'filamentLengthM',
      'filamentCost',
      'estimatedTimeSeconds',
    ];
    const dimensions = metadata['dimensionsMm'];
    return (
      ['id', 'name', 'path', 'extension', 'modifiedAt'].every(
        (key) => typeof value[key] === 'string',
      ) &&
      ['gcode', 'image', 'binary', 'log', 'model', 'archive'].includes(value['kind'] as string) &&
      typeof value['sizeBytes'] === 'number' &&
      Number.isFinite(value['sizeBytes']) &&
      (value['thumbnailUrl'] === undefined || typeof value['thumbnailUrl'] === 'string') &&
      optionalNumbers.every(
        (key) => metadata[key] === undefined || this.isFiniteNumber(metadata[key]),
      ) &&
      (dimensions === undefined ||
        (this.isRecord(dimensions) &&
          ['x', 'y', 'z'].every((key) => this.isFiniteNumber(dimensions[key]))))
    );
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
  }
}
