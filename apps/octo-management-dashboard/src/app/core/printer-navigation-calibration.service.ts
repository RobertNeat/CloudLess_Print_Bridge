import { Injectable } from '@angular/core';
import type { PrinterNavigationData } from '../dashboard/dashboard.models';

const STORAGE_KEY = 'octo-management-dashboard-navigation-calibration-v1';

/**
 * Persists printer-navigation's axis-point/hotend-point UI calibration
 * (where the +X/-X etc. jog buttons are drawn on the bed image) across page
 * reloads — the same localStorage-backed restore()/save() pattern
 * DashboardLayoutService already uses for widget grid positions.
 *
 * Deliberately persists only the PrinterNavigationData shape (axisPoints,
 * hotendPoint, steps, viewport) — never axisRanges. The machine's real
 * travel envelope always comes live from GET /device_config/profile
 * (dashboard-static-defaults.ts's STATIC_AXIS_RANGES/DEFAULT_AXIS_RANGES is
 * explicitly documented as wrong for the real A1); caching a stale envelope
 * here would be a safety regression, not a persistence fix.
 */
@Injectable({ providedIn: 'root' })
export class PrinterNavigationCalibrationService {
  restore(defaults: PrinterNavigationData): PrinterNavigationData {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return defaults;
      const parsed = JSON.parse(stored) as Partial<PrinterNavigationData>;
      if (!parsed || typeof parsed !== 'object') return defaults;
      return {
        axisPoints: parsed.axisPoints ?? defaults.axisPoints,
        hotendPoint: parsed.hotendPoint ?? defaults.hotendPoint,
        steps: parsed.steps ?? defaults.steps,
        viewport: parsed.viewport ?? defaults.viewport,
      };
    } catch {
      return defaults;
    }
  }

  save(navigation: PrinterNavigationData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(navigation));
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
