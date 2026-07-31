import { computed, Injectable, signal } from '@angular/core';
import type { TranslationKey } from './i18n.service';

export type DashboardId = 'management' | 'files' | 'videos';
export type BackendServiceId = 'mqtt-puppeteer' | 'ftps-remote-manager' | 'video-service-hub';

export interface DashboardDefinition {
  readonly id: DashboardId;
  readonly labelKey: TranslationKey;
  readonly icon: string;
  readonly requiredService: BackendServiceId;
}

const dashboards: readonly DashboardDefinition[] = [
  {
    id: 'management',
    labelKey: 'management',
    icon: 'pi pi-sliders-h',
    requiredService: 'mqtt-puppeteer',
  },
  {
    id: 'files',
    labelKey: 'files',
    icon: 'pi pi-folder',
    requiredService: 'ftps-remote-manager',
  },
  {
    id: 'videos',
    labelKey: 'videos',
    icon: 'pi pi-video',
    requiredService: 'video-service-hub',
  },
];

@Injectable({ providedIn: 'root' })
export class DashboardCatalogService {
  // Prototype availability. Replace these values with health-check results from the API layer.
  readonly serviceAvailability = signal<Record<BackendServiceId, boolean>>({
    'mqtt-puppeteer': true,
    'ftps-remote-manager': true,
    'video-service-hub': true,
  });

  readonly availableDashboards = computed(() =>
    dashboards.filter(({ requiredService }) => this.serviceAvailability()[requiredService]),
  );

  find(id: DashboardId): DashboardDefinition | undefined {
    return dashboards.find((dashboard) => dashboard.id === id);
  }

  isDashboardId(value: string | undefined): value is DashboardId {
    return dashboards.some((dashboard) => dashboard.id === value);
  }

  isAvailable(id: DashboardId): boolean {
    const dashboard = this.find(id);
    return dashboard ? this.serviceAvailability()[dashboard.requiredService] : false;
  }
}
