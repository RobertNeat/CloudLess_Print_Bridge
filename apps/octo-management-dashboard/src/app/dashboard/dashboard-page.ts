import { Component, computed, effect, inject, signal } from '@angular/core';
import { Gridster, GridsterItem, type GridsterConfig } from 'angular-gridster2';
import { DashboardLayoutService } from '../core/dashboard-layout.service';
import { I18nService } from '../core/i18n.service';
import { PrinterNavigationCalibrationService } from '../core/printer-navigation-calibration.service';
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
import type { TemperatureChange, TemperatureSensor } from './printer-temperatures/printer-temperatures';
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
  private readonly navigationCalibration = inject(PrinterNavigationCalibrationService);

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

  /**
   * Which temperature sensors the popover editor lets the user set. Bed and
   * nozzle are settable on every profile mqtt-puppeteer supports today; the
   * chamber only becomes settable when the ACTIVE printer profile reports a
   * chamber heater (GET /device_config/profile -> heaterCapabilities). This
   * must stay derived from that flag rather than a hardcoded literal array,
   * so a future printer profile with a chamber heater becomes editable here
   * with zero frontend code changes.
   */
  protected readonly settableTemperatureSensors = computed<readonly TemperatureSensor[]>(() => {
    const hasChamberHeater = this.dashboard()?.deviceCapabilities.hasChamberHeater ?? false;
    return hasChamberHeater ? ['chamber', 'bed', 'nozzle'] : ['bed', 'nozzle'];
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
        // Live current-temperature readings — this is the actual fix for
        // "temperature-reading-* never updates": previously this effect
        // patched controls/coordinates but silently dropped
        // state.temperatures on the floor, so the three readings stayed
        // frozen at whatever load() returned. Suppressed the same way as
        // every other optimistically-set field, so the next poll tick
        // doesn't visibly snap a just-submitted target back to the
        // not-yet-caught-up current reading.
        const temperatures = { ...data.temperatures };
        if (state.temperatures) {
          // Suppressed per-sensor (not one shared 'temperatures' key): a
          // just-submitted nozzle target must not also freeze the bed/
          // chamber current readings for the suppression window.
          if (!this.controlsSuppression.isSuppressed('temperatures.chamber')) {
            temperatures.chamber = state.temperatures.chamber?.current ?? temperatures.chamber;
          }
          if (!this.controlsSuppression.isSuppressed('temperatures.bed')) {
            temperatures.bed = state.temperatures.bed?.current ?? temperatures.bed;
          }
          if (!this.controlsSuppression.isSuppressed('temperatures.nozzle')) {
            temperatures.nozzle = state.temperatures.nozzle?.current ?? temperatures.nozzle;
          }
        }
        return { ...data, controls, coordinates, positionSource, temperatures };
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
    /**
     * When fanSpeed changes, automatically derive fansEnabled from it
     * (enabled if > 0, disabled if = 0). This keeps the two fields in
     * sync locally and at the API level (the adapter only takes a
     * percent, never a separate on/off command). Skip updating when key
     * is already fansEnabled (for backward compatibility if the parent
     * ever calls this directly with that key, though the template no
     * longer does).
     */
    const shouldUpdateFansEnabled = key === 'fanSpeed';
    const fansEnabledValue = shouldUpdateFansEnabled ? (value as number) > 0 : undefined;

    await this.runCommand({ type: 'set-control', key, value }, () => {
      this.controlsSuppression.suppress(key);
      this.dashboard.update((data) => {
        if (!data) return data;
        const updates: Record<string, unknown> = { [key]: value };
        if (shouldUpdateFansEnabled) {
          updates['fansEnabled'] = fansEnabledValue;
        }
        return { ...data, controls: { ...data.controls, ...updates } };
      });
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

  /**
   * Axis-point calibration (drag-to-place jog-button positions) is a
   * UI-only concern the backend has no model for — set-navigation is a
   * permanent client-side no-op (see http-printer-command.adapter.ts).
   * Without an explicit durable store here, every calibration edit would
   * live only in the `dashboard` signal and revert to
   * STATIC_NAVIGATION_DEFAULTS on the next load(). Persist it the same way
   * DashboardLayoutService persists widget layout (localStorage-backed
   * restore()/save()) rather than inventing a new mechanism.
   */
  protected async updateNavigationConfiguration(
    configuration: PrinterNavigationConfiguration,
  ): Promise<void> {
    await this.runCommand({ type: 'set-navigation', configuration }, () => {
      const navigation = {
        axisPoints: configuration.axisPoints,
        hotendPoint: configuration.hotendPoint,
        steps: [...configuration.steps],
        viewport: configuration.viewport,
      };
      this.navigationCalibration.save(navigation);
      this.dashboard.update((data) => (data ? { ...data, navigation } : data));
    });
  }

  /**
   * axesReset only clears the on-screen jog-control calibration overlay
   * (where the +X/-X etc. buttons are drawn on the bed image) — it is not
   * a machine command and must never trigger a physical home. It reuses
   * the set-navigation command path since that's the same local/UI-only
   * persistence axesReset always needed, and must persist the cleared
   * state too (otherwise reload would resurrect the old points from
   * localStorage and the reset would look broken).
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
      () => {
        const navigation = { ...data.navigation, axisPoints: event.axisPoints };
        this.navigationCalibration.save(navigation);
        this.dashboard.update((current) => (current ? { ...current, navigation } : current));
      },
    );
  }

  /**
   * Unconditional physical home command — resolves the "position unknown"
   * blocking banner. No optimistic local state patch: the next poll tick
   * picks up the real position/positionSource once the printer actually
   * homes and reports back (see the `latestDomainState()` effect above),
   * which is what naturally re-enables jogDisabled-gated controls. Must
   * never suppress the 'coordinates' poll key — doing so would delay that
   * very unlock. Must never touch axis-point calibration state: homing and
   * UI calibration persistence are independent concerns.
   */
  protected async home(): Promise<void> {
    await this.runCommand({ type: 'home' }, () => {
      // Intentionally empty: see doc comment above.
    });
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
    await this.runCommand({ type: 'set-temperature', change }, () => {
      // Suppress the next poll tick(s) for this field like every other
      // optimistically-patched control: the backend won't reach the new
      // target instantly, so an immediate poll would otherwise snap the
      // just-submitted value back to the stale current reading. Keyed per
      // sensor so setting one target doesn't also freeze the other two
      // sensors' current readings.
      this.controlsSuppression.suppress(`temperatures.${change.sensor}`);
      this.dashboard.update((data) =>
        data
          ? {
              ...data,
              temperatures: { ...data.temperatures, [change.sensor]: change.value },
            }
          : data,
      );
    });
  }

  private async loadData(): Promise<void> {
    try {
      const data = await this.dataSource.load();
      this.dashboard.set({
        ...data,
        navigation: this.navigationCalibration.restore(data.navigation),
      });
      this.widgets.set(this.layout.restore(data.widgets));
    } catch (error) {
      console.error('[dashboard] failed to load dashboard data:', error);
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
