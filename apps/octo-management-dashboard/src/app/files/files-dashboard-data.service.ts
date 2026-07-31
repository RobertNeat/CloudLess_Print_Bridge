import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { FilesDashboardData } from './files-dashboard.models';

@Injectable({ providedIn: 'root' })
export class FilesDashboardDataService {
  private readonly http = inject(HttpClient);

  async load(): Promise<FilesDashboardData> {
    const source = await firstValueFrom(
      this.http.get('/mock-data/files-dashboard.json', { responseType: 'text' }),
    );
    const parsed: unknown = JSON.parse(source);
    if (!this.isFilesDashboardData(parsed)) {
      throw new Error('Mock files dashboard data has an invalid shape.');
    }
    return structuredClone(parsed);
  }

  private isFilesDashboardData(value: unknown): value is FilesDashboardData {
    if (!value || typeof value !== 'object') return false;
    const data = value as Partial<FilesDashboardData>;
    return (
      Array.isArray(data.pinnedLocations) &&
      Array.isArray(data.tree) &&
      Array.isArray(data.files) &&
      typeof data.initialFolderPath === 'string' &&
      typeof data.uploadPath === 'string'
    );
  }
}
