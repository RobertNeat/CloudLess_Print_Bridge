import { Injectable, signal } from '@angular/core';
import type { DashboardWidget } from '../dashboard/dashboard.models';

const STORAGE_KEY = 'octo-management-dashboard-layout-v1';

@Injectable({ providedIn: 'root' })
export class DashboardLayoutService {
  readonly editing = signal(false);
  readonly resetVersion = signal(0);
  readonly resetting = signal(false);

  toggle(): void {
    this.editing.update((editing) => !editing);
  }

  reset(): void {
    this.resetting.set(true);
    localStorage.removeItem(STORAGE_KEY);
    this.editing.set(false);
    this.resetVersion.update((version) => version + 1);
  }

  completeReset(): void {
    this.resetting.set(false);
  }

  restore(defaults: DashboardWidget[]): DashboardWidget[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return defaults;
      const positions = JSON.parse(stored) as Record<string, Pick<DashboardWidget, 'x' | 'y' | 'cols' | 'rows'>>;
      return defaults.map((widget) => ({ ...widget, ...positions[widget.id] }));
    } catch {
      return defaults;
    }
  }

  save(widgets: DashboardWidget[]): void {
    const positions = Object.fromEntries(
      widgets.map(({ id, x, y, cols, rows }) => [id, { x, y, cols, rows }]),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  }
}
