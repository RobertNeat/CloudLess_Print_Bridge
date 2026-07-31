import { Component, computed, effect, inject, signal } from '@angular/core';
import { Gridster, GridsterItem, type GridsterConfig } from 'angular-gridster2';
import { DashboardLayoutService } from '../core/dashboard-layout.service';
import { CurrentPrintJob } from './current-print-job/current-print-job';
import { DashboardDataService } from './dashboard-data.service';
import type { DashboardWidget, ManagementDashboardData, PrintSpeedMode } from './dashboard.models';
import { LivePreview } from './live-preview/live-preview';
import { PrinterNavigation } from './printer-navigation/printer-navigation';
import type { PrinterNavigationConfiguration } from './printer-navigation/printer-navigation.models';
import { PrinterQuickControls } from './printer-quick-controls/printer-quick-controls';
import { PrinterTemperatures } from './printer-temperatures/printer-temperatures';
import { TelemetryChart } from './telemetry-chart/telemetry-chart';

@Component({
  selector: 'app-dashboard-page',
  imports: [CurrentPrintJob, Gridster, GridsterItem, LivePreview, PrinterNavigation, PrinterQuickControls, PrinterTemperatures, TelemetryChart],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly dataService = inject(DashboardDataService);
  protected readonly layout = inject(DashboardLayoutService);

  protected readonly dashboard = signal<ManagementDashboardData | null>(null);
  protected readonly widgets = signal<DashboardWidget[]>([]);
  protected readonly widgetRenderVersion = signal(0);
  protected readonly loadingError = signal(false);

  protected readonly gridsterOptions = computed<GridsterConfig>(() => {
    const editing = this.layout.editing();

    return {
      draggable: {
        enabled: editing,
        ignoreContent: false,
      },
      resizable: {
        enabled: editing,
        handles: {
          n: true,
          e: true,
          s: true,
          w: true,
          ne: true,
          nw: true,
          se: true,
          sw: true,
        },
      },
      displayGrid: 'onDrag&Resize',
      gridType: 'scrollVertical',
      minCols: 12,
      maxCols: 12,
      minRows: 10,
      maxRows: 100,
      fixedRowHeight: 82,
      margin: 6,
      outerMargin: true,
      pushItems: true,
      disableScrollHorizontal: true,
      disableScrollVertical: true,
    };
  });

  constructor() {
    effect(() => {
      const editing = this.layout.editing();
      const resetting = this.layout.resetting();
      if (!editing && !resetting && this.widgets().length) this.layout.save(this.widgets());
    });
    effect(() => {
      const resetVersion = this.layout.resetVersion();
      if (resetVersion === 0) return;
      const data = this.dashboard();
      if (data) {
        this.widgetRenderVersion.update((version) => version + 1);
        this.widgets.set(data.widgets.map((widget) => ({ ...widget })));
        this.layout.completeReset();
      }
    });
    void this.loadData();
  }

  protected chart(widget: DashboardWidget) {
    const data = this.dashboard();
    if (!data) return null;
    if (widget.type === 'progress-chart') return data.charts.progress;
    if (widget.type === 'temperature-chart') return data.charts.temperature;
    if (widget.type === 'fan-chart') return data.charts.fan;
    return null;
  }

  protected updateControl(key: 'lightEnabled' | 'fansEnabled' | 'fanSpeed' | 'printSpeed', value: boolean | number | PrintSpeedMode): void {
    this.dashboard.update((data) => data ? ({ ...data, controls: { ...data.controls, [key]: value } }) : data);
  }

  protected updateCoordinates(coordinates: ManagementDashboardData['coordinates']): void {
    this.dashboard.update((data) => data ? ({ ...data, coordinates }) : data);
  }

  protected updateNavigationConfiguration(configuration: PrinterNavigationConfiguration): void {
    this.dashboard.update((data) =>
      data
        ? {
            ...data,
            navigation: {
              axisPoints: configuration.axisPoints,
              hotendPoint: configuration.hotendPoint,
              steps: [...configuration.steps],
              viewport: configuration.viewport,
            },
          }
        : data,
    );
  }

  protected setPrintStatus(status: ManagementDashboardData['printJob']['status']): void {
    this.dashboard.update((data) => data ? ({ ...data, printJob: { ...data.printJob, status } }) : data);
  }

  protected updatePreview(change: Partial<ManagementDashboardData['livePreview']>): void {
    this.dashboard.update((data) => data ? ({ ...data, livePreview: { ...data.livePreview, ...change } }) : data);
  }

  private async loadData(): Promise<void> {
    try {
      const data = await this.dataService.loadManagementDashboard();
      this.dashboard.set(data);
      this.widgets.set(this.layout.restore(data.widgets));
    } catch {
      this.loadingError.set(true);
    }
  }
}
