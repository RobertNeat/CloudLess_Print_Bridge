import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CommandExecutionError } from './backend/http-error-mapping';
import { MANAGEMENT_DASHBOARD_DATA_SOURCE } from './dashboard-data.service';
import type { ManagementDashboardData } from './dashboard.models';
import { DashboardPage } from './dashboard-page';
import { PRINTER_COMMAND_PORT, type PrinterCommand, type PrinterCommandPort } from './printer-command.port';

function sampleData(): ManagementDashboardData {
  return {
    printJob: {
      name: 'Part',
      thumbnailUrl: '',
      thumbnailAlt: '',
      progress: 10,
      currentLayer: 1,
      totalLayers: 10,
      estimatedPrintTime: '—',
      status: 'printing',
    },
    controls: { lightEnabled: false, fansEnabled: false, fanSpeed: 0, printSpeed: 'standard' },
    temperatures: { chamber: null, bed: 60, nozzle: 210 },
    coordinates: { X: 0, Y: 0, Z: 20 },
    positionSource: 'commanded',
    axisRanges: {
      X: { min: 0, max: 256 },
      Y: { min: 0, max: 256 },
      Z: { min: 20, max: 240 },
    },
    navigation: {
      axisPoints: {
        X: { positive: null, negative: null },
        Y: { positive: null, negative: null },
        Z: { positive: null, negative: null },
      },
      hotendPoint: { x: 0, y: 0 },
      steps: [1, 10],
      viewport: {
        imageUrl: '',
        imageAlt: '',
        width: 100,
        height: 100,
        viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
      },
    },
    livePreview: {
      cameraName: '',
      resolution: '',
      availableResolutions: [],
      active: false,
      latencyMs: 0,
    },
    widgets: [{ id: 'quick-controls', type: 'quick-controls', x: 0, y: 0, cols: 6, rows: 1 }],
    charts: {
      progress: {
        kind: 'progress',
        titleKey: 'chart.progress.title',
        subtitleKey: 'chart.progress.subtitle',
        xAxisLabelKey: 'chart.axis.time',
        yAxisLabelKey: 'chart.axis.progress',
        yMin: 0,
        yMax: 100,
        yStepSize: 10,
        valueSuffix: '%',
        labels: [],
        datasets: [],
      },
      temperature: {
        kind: 'temperature',
        titleKey: 'chart.temperature.title',
        subtitleKey: 'chart.temperature.subtitle',
        xAxisLabelKey: 'chart.axis.time',
        yAxisLabelKey: 'chart.axis.temperature',
        yMin: 0,
        yMax: 250,
        yStepSize: 50,
        valueSuffix: '°C',
        labels: [],
        datasets: [],
      },
      fan: {
        kind: 'fan',
        titleKey: 'chart.fan.title',
        subtitleKey: 'chart.fan.subtitle',
        xAxisLabelKey: 'chart.axis.time',
        yAxisLabelKey: 'chart.axis.fan',
        yMin: 0,
        yMax: 100,
        yStepSize: 10,
        valueSuffix: '%',
        labels: [],
        datasets: [],
      },
    },
  };
}

class RecordingCommandPort implements PrinterCommandPort {
  readonly executed: PrinterCommand[] = [];
  failNext: unknown = null;

  async execute(command: PrinterCommand): Promise<void> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.executed.push(command);
  }
}

describe('DashboardPage', () => {
  let commandPort: RecordingCommandPort;

  function setUp(data: ManagementDashboardData = sampleData()) {
    commandPort = new RecordingCommandPort();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MANAGEMENT_DASHBOARD_DATA_SOURCE, useValue: { load: async () => data } },
        { provide: PRINTER_COMMAND_PORT, useValue: commandPort },
      ],
    });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    return fixture;
  }

  it('loads dashboard data and issues a set-control command when a quick control changes', async () => {
    const fixture = setUp();
    await fixture.whenStable();

    await fixture.componentInstance['updateControl']('lightEnabled', true);

    expect(commandPort.executed).toEqual([{ type: 'set-control', key: 'lightEnabled', value: true }]);
    expect(fixture.componentInstance['dashboard']()?.controls.lightEnabled).toBe(true);
  });

  it('leaves local state untouched and does not throw when a command is rejected', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    commandPort.failNext = new Error('rejected');

    await fixture.componentInstance['updateControl']('lightEnabled', true);

    expect(fixture.componentInstance['dashboard']()?.controls.lightEnabled).toBe(false);
    expect(fixture.componentInstance['commandError']()).toBeTruthy();
  });

  it('pauses the print job and optimistically updates the local status', async () => {
    const fixture = setUp();
    await fixture.whenStable();

    await fixture.componentInstance['setPrintStatus']('paused');

    expect(commandPort.executed).toEqual([{ type: 'set-print-status', status: 'paused' }]);
    expect(fixture.componentInstance['dashboard']()?.printJob.status).toBe('paused');
  });

  it('leaves the print job status untouched when the pause command is rejected', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    commandPort.failNext = new Error('rejected');

    await fixture.componentInstance['setPrintStatus']('paused');

    expect(fixture.componentInstance['dashboard']()?.printJob.status).toBe('printing');
    expect(fixture.componentInstance['commandError']()).toBeTruthy();
  });

  it('sets a sensor target temperature and optimistically updates local state', async () => {
    const fixture = setUp();
    await fixture.whenStable();

    await fixture.componentInstance['updateTemperature']({ sensor: 'nozzle', value: 230 });

    expect(commandPort.executed).toEqual([
      { type: 'set-temperature', change: { sensor: 'nozzle', value: 230 } },
    ]);
    expect(fixture.componentInstance['dashboard']()?.temperatures.nozzle).toBe(230);
  });

  it('leaves temperatures untouched when a backend-rejected out-of-range value is sent', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    commandPort.failNext = new Error('nozzle celsius must be at most 300');

    await fixture.componentInstance['updateTemperature']({ sensor: 'nozzle', value: 1000 });

    expect(fixture.componentInstance['dashboard']()?.temperatures.nozzle).toBe(210);
    expect(fixture.componentInstance['commandError']()).toBeTruthy();
  });

  it('moves to an in-bounds target and optimistically updates local coordinates', async () => {
    const fixture = setUp();
    await fixture.whenStable();

    await fixture.componentInstance['updateCoordinates']({ X: 125, Y: 125, Z: 20 });

    expect(commandPort.executed).toEqual([
      { type: 'set-coordinates', coordinates: { X: 125, Y: 125, Z: 20 } },
    ]);
    expect(fixture.componentInstance['dashboard']()?.coordinates).toEqual({ X: 125, Y: 125, Z: 20 });
  });

  it('leaves coordinates at their pre-command value when the backend rejects an out-of-bounds move — never corrupts local state', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    commandPort.failNext = new Error('z must be at most 240');

    await fixture.componentInstance['updateCoordinates']({ X: 100, Y: 100, Z: 500 });

    expect(fixture.componentInstance['dashboard']()?.coordinates).toEqual({ X: 0, Y: 0, Z: 20 });
    expect(fixture.componentInstance['commandError']()).toBeTruthy();
  });

  it('jogs the hotend without touching tracked coordinates', async () => {
    const fixture = setUp();
    await fixture.whenStable();

    await fixture.componentInstance['jogHotend']({ direction: 'down', step: 10, delta: 10 });

    expect(commandPort.executed).toEqual([
      { type: 'jog-hotend', action: { direction: 'down', step: 10, delta: 10 } },
    ]);
    expect(fixture.componentInstance['dashboard']()?.coordinates).toEqual({ X: 0, Y: 0, Z: 20 });
  });

  it('surfaces a command error when a hotend jog is rejected', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    commandPort.failNext = new Error('millimeters must be at most 50');

    await fixture.componentInstance['jogHotend']({ direction: 'down', step: 100, delta: 100 });

    expect(fixture.componentInstance['commandError']()).toBeTruthy();
  });

  it('resets only the on-screen axis calibration overlay, not the tracked coordinates', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    const emptyPoints = {
      X: { positive: null, negative: null },
      Y: { positive: null, negative: null },
      Z: { positive: null, negative: null },
    };

    await fixture.componentInstance['resetAxes']({ axisPoints: emptyPoints, hotendPoint: null });

    expect(commandPort.executed).toEqual([
      expect.objectContaining({ type: 'set-navigation' }),
    ]);
    expect(fixture.componentInstance['dashboard']()?.navigation.axisPoints).toEqual(emptyPoints);
    expect(fixture.componentInstance['dashboard']()?.coordinates).toEqual({ X: 0, Y: 0, Z: 20 });
  });

  describe('commandError surfaces the right kind and never corrupts local state', () => {
    const cases: Array<{
      kind: 'validation' | 'unavailable' | 'network' | 'forbidden';
      message: string;
    }> = [
      { kind: 'validation', message: 'z must be at most 240' },
      { kind: 'unavailable', message: 'MQTT client is not connected' },
      { kind: 'network', message: 'Nie udało się połączyć z usługą mqtt-puppeteer.' },
      { kind: 'forbidden', message: 'Operation is not permitted.' },
    ];

    it.each(cases)('reflects a $kind error in the banner', async ({ kind, message }) => {
      const fixture = setUp();
      await fixture.whenStable();
      commandPort.failNext = new CommandExecutionError({ kind, message });

      await fixture.componentInstance['updateControl']('lightEnabled', true);

      expect(fixture.componentInstance['commandError']()).toEqual({ kind, message });
      expect(fixture.componentInstance['dashboard']()?.controls.lightEnabled).toBe(false);
    });
  });
});
