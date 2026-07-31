import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ManagementDashboardData } from './dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardDataService {
  private readonly http = inject(HttpClient);

  async loadManagementDashboard(): Promise<ManagementDashboardData> {
    const source = await firstValueFrom(
      this.http.get('/mock-data/management-dashboard.json', { responseType: 'text' }),
    );
    const parsed: unknown = JSON.parse(source);

    if (!this.isDashboardData(parsed)) {
      throw new Error('Mock dashboard data has an invalid shape.');
    }

    return structuredClone(parsed);
  }

  private isDashboardData(value: unknown): value is ManagementDashboardData {
    if (!value || typeof value !== 'object') return false;
    const data = value as Partial<ManagementDashboardData>;
    return (
      !!data.printJob &&
      !!data.controls &&
      !!data.temperatures &&
      !!data.coordinates &&
      !!data.navigation &&
      !!data.livePreview &&
      Array.isArray(data.widgets) &&
      !!data.charts
    );
  }
}
