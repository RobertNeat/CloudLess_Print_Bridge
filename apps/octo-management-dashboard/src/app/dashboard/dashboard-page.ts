import { Component, computed, effect, inject, signal } from '@angular/core';
import { Gridster, GridsterItem, type GridsterConfig } from 'angular-gridster2';
import { DashboardLayoutService } from '../core/dashboard-layout.service';
import { I18nService } from '../core/i18n.service';
import { DashboardPollingService, PollSuppressionWindow } from './backend/dashboard-polling.service';
import { CommandExecutionError, type CommandError } from './backend/http-error-mapping';
import { TelemetryPollingService } from './backend/telemetry-polling.service';
import { mapFanChart, mapProgressChart, mapTemperatureChart } from './backend/telemetry-mapping';
import { CurrentPrintJob } from './current-print-job/current-print-job';
import { MANAGEMENT_DASHBOARD_DATA_SOURCE } from './dashboard-data.service';
import type { DashboardWidget, ManagementDashboardData, PrintSpeedMode } from './dashboard.models';
import { LivePreview } from './live-preview/live-preview';
import { PrinterNavigation } from './printer-navigation/printer-navigation';
import type {
  AxisPointResetEvent,
  HotendActionEvent,
  PrinterNavigationConfiguration,
} from './printer-navigation/printer-navigation.models';
import { createPrinterNavigationLabels } from './printer-navigation/printer-navigation.i18n';
import { PrinterCommandFacade } from './printer-command.port';
import { PrinterQuickControls } from './printer-quick-controls/printer-quick-controls';
import { PrinterTemperatures } from './printer-temperatures/printer-temperatures';
import type { TemperatureChange } from './printer-temperatures/printer-temperatures';
import { TelemetryChart } from './telemetry-chart/telemetry-chart';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    CurrentPrintJob,
    Gridster,
    GridsterItem,
    LivePreview,
    PrinterNavigation,
    PrinterQuickControls,
    PrinterTemperatures,
    TelemetryChart,
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly dataSource = inject(MANAGEMENT_DASHBOARD_DATA_SOURCE);
  private readonly commands = inject(PrinterCommandFacade);
  private readonly polling = inject(DashboardPollingService);
  private readonly telemetryPolling = inject(TelemetryPollingService);
  private readonly controlsSuppression = new PollSuppressionWindow();
  protected readonly i18n = inject(I18nService);
  protected readonly layout = inject(DashboardLayoutService);

  protected readonly dashboard = signal<ManagementDashboardData | null>(null);
  protected readonly widgets = signal<DashboardWidget[]>([]);
  protected readonly widgetRenderVersion = signal(0);
  protected readonly loadingError = signal(false);
  /**
   * Richer than a boolean on purpose: "printer offline" (unavailable),
   * "Z position out of range" (validation), and "not permitted" (forbidden)
   * each warrant different banner copy, and every adapter method already
   * throws this exact CommandError shape (via mapHttpError/
   * CommandExecutionError), so surfacing it here is close to free.
   */
  protected readonly commandError = signal<CommandError | null>(null);
  protected readonly navigationLabels = computed(() => {
    this.i18n.language();
    return createPrinterNavigationLabels(this.i18n);
  });

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
    effect(() => {
      const state = this.polling.latestDomainState();
      if (!state) return;
      this.dashboard.update((data) => {
        if (!data) return data;
        const controls = { ...data.controls };
        if (!this.controlsSuppression.isSuppressed('lightEnabled') && state.lightOn !== undefined) {
          controls.lightEnabled = state.lightOn;
        }
        if (!this.controlsSuppression.isSuppressed('fanSpeed') && state.fans?.coolingPercent !== undefined) {
          controls.fanSpeed = state.fans.coolingPercent;
          controls.fansEnabled = state.fans.coolingPercent > 0;
        }
        let coordinates = data.coordinates;
        let positionSource = data.positionSource;
        if (!this.controlsSuppression.isSuppressed('coordinates') && state.position) {
          const { x, y, z, source } = state.position;
          positionSource = source;
          if (x !== null && y !== null && z !== null) {
            coordinates = { X: x, Y: y, Z: z };
          }
        }
        return { ...data, controls, coordinates, positionSource };
      });
    });
    effect(() => {
      const history = this.telemetryPolling.latestHistory();
      if (!history) return;
      this.dashboard.update((data) => {
        if (!data) return data;
        return {
          ...data,
          charts: {
            progress: { ...data.charts.progress, ...mapProgressChart(history.samples) },
            temperature: { ...data.charts.temperature, ...mapTemperatureChart(history.samples) },
            fan: { ...data.charts.fan, ...mapFanChart(history.samples) },
          },
        };
      });
    });
    void this.loadData();
    this.polling.start();
    this.telemetryPolling.start();
  }

  protected chart(widget: DashboardWidget) {
    const data = this.dashboard();
    if (!data) return null;
    if (widget.type === 'progress-chart') return data.charts.progress;
    if (widget.type === 'temperature-chart') return data.charts.temperature;
    if (widget.type === 'fan-chart') return data.charts.fan;
    return null;
  }

  protected async updateControl(
    key: 'lightEnabled' | 'fansEnabled' | 'fanSpeed' | 'printSpeed',
    value: boolean | number | PrintSpeedMode,
  ): Promise<void> {
    await this.runCommand({ type: 'set-control', key, value }, () => {
      this.controlsSuppression.suppress(key === 'fansEnabled' ? 'fanSpeed' : key);
      this.dashboard.update((data) =>
        data ? { ...data, controls: { ...data.controls, [key]: value } } : data,
      );
    });
  }

  protected moveWidgetByKeyboard(widget: DashboardWidget, event: KeyboardEvent): void {
    if (!this.layout.editing()) return;
    const movement: Partial<Record<string, { x: number; y: number }>> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    this.widgets.update((widgets) =>
      widgets.map((item) =>
        item.id === widget.id
          ? {
              ...item,
              x: Math.max(0, Math.min(12 - item.cols, item.x + delta.x)),
              y: Math.max(0, item.y + delta.y),
            }
          : item,
      ),
    );
  }

  protected async updateCoordinates(
    coordinates: ManagementDashboardData['coordinates'],
  ): Promise<void> {
    await this.runCommand({ type: 'set-coordinates', coordinates }, () => {
      this.controlsSuppression.suppress('coordinates');
      this.dashboard.update((data) => (data ? { ...data, coordinates } : data));
    });
  }

  protected async updateNavigationConfiguration(
    configuration: PrinterNavigationConfiguration,
  ): Promise<void> {
    await this.runCommand({ type: 'set-navigation', configuration }, () =>
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
      ),
    );
  }

  /**
   * axesReset only clears the on-screen jog-control calibration overlay
   * (where the +X/-X etc. buttons are drawn on the bed image) — it is not
   * a machine command and must never trigger a physical home. It reuses
   * the set-navigation command path since that's the same local/UI-only
   * persistence axesReset always needed.
   */
  protected async resetAxes(event: AxisPointResetEvent): Promise<void> {
    const data = this.dashboard();
    if (!data) return;
    await this.runCommand(
      {
        type: 'set-navigation',
        configuration: {
          axisPoints: event.axisPoints,
          hotendPoint: { x: 0, y: 0 },
          mainStep: data.navigation.steps[data.navigation.steps.length - 1] ?? 1,
          positionPanelPlacement: 'top-right',
          steps: data.navigation.steps,
          axisRanges: data.axisRanges,
          axisColor: 'var(--printer-axis-color)',
          viewport: data.navigation.viewport,
        },
      },
      () =>
        this.dashboard.update((current) =>
          current
            ? {
                ...current,
                navigation: { ...current.navigation, axisPoints: event.axisPoints },
              }
            : current,
        ),
    );
  }

  protected async jogHotend(action: HotendActionEvent): Promise<void> {
    await this.runCommand({ type: 'jog-hotend', action }, () => {
      // No optimistic local state to patch: hotend position isn't tracked
      // anywhere in ManagementDashboardData today (only X/Y/Z coordinates
      // are). The command still round-trips through runCommand so a
      // rejected move surfaces the same commandError banner as every other
      // command.
    });
  }

  protected async setPrintStatus(
    status: ManagementDashboardData['printJob']['status'],
  ): Promise<void> {
    await this.runCommand({ type: 'set-print-status', status }, () =>
      this.dashboard.update((data) =>
        data ? { ...data, printJob: { ...data.printJob, status } } : data,
      ),
    );
  }

  protected async updatePreview(
    change: Partial<ManagementDashboardData['livePreview']>,
  ): Promise<void> {
    await this.runCommand({ type: 'set-preview', change }, () =>
      this.dashboard.update((data) =>
        data ? { ...data, livePreview: { ...data.livePreview, ...change } } : data,
      ),
    );
  }

  protected async updateTemperature(change: TemperatureChange): Promise<void> {
    await this.runCommand({ type: 'set-temperature', change }, () =>
      this.dashboard.update((data) =>
        data
          ? {
              ...data,
              temperatures: { ...data.temperatures, [change.sensor]: change.value },
            }
          : data,
      ),
    );
  }

  private async loadData(): Promise<void> {
    try {
      const data = await this.dataSource.load();
      this.dashboard.set(data);
      this.widgets.set(this.layout.restore(data.widgets));
    } catch {
      this.loadingError.set(true);
    }
  }

  private async runCommand(
    command: Parameters<PrinterCommandFacade['execute']>[0],
    apply: () => void,
  ): Promise<void> {
    try {
      this.commandError.set(null);
      await this.commands.execute(command);
      apply();
    } catch (error) {
      this.commandError.set(
        error instanceof CommandExecutionError
          ? error.error
          : { kind: 'unknown', message: 'Wystąpił nieoczekiwany błąd.' },
      );
    }
  }
}
