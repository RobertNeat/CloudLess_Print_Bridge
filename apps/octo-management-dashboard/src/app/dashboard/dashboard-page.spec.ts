import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DashboardPollingService } from './backend/dashboard-polling.service';
import { CommandExecutionError } from './backend/http-error-mapping';
import { MANAGEMENT_DASHBOARD_DATA_SOURCE } from './dashboard-data.service';
import type { ManagementDashboardData } from './dashboard.models';
import { DashboardPage } from './dashboard-page';
import {
  PRINTER_COMMAND_PORT,
  type PrinterCommand,
  type PrinterCommandPort,
} from './printer-command.port';

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
    deviceCapabilities: { hasChamberHeater: false },
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
      cameraId: '',
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
    // Reset first so a test that calls setUp() twice (simulating a page
    // reload against the same localStorage-backed calibration store) gets
    // a genuinely fresh DashboardPage/TestBed instance rather than
    // TestBed's "already instantiated" error on the second configure.
    TestBed.resetTestingModule();
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

    expect(commandPort.executed).toEqual([
      { type: 'set-control', key: 'lightEnabled', value: true },
    ]);
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

  it('sends a set-temperature command without touching the current reading', async () => {
    const fixture = setUp();
    await fixture.whenStable();

    await fixture.componentInstance['updateTemperature']({ sensor: 'nozzle', value: 230 });

    expect(commandPort.executed).toEqual([
      { type: 'set-temperature', change: { sensor: 'nozzle', value: 230 } },
    ]);
    expect(fixture.componentInstance['dashboard']()?.temperatures.nozzle).toBe(210);
  });

  it('reports a command error when a backend-rejected out-of-range value is sent', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    commandPort.failNext = new Error('nozzle celsius must be at most 300');

    await fixture.componentInstance['updateTemperature']({ sensor: 'nozzle', value: 1000 });

    expect(fixture.componentInstance['dashboard']()?.temperatures.nozzle).toBe(210);
    expect(fixture.componentInstance['commandError']()).toBeTruthy();
  });

  it('applies a polled current-temperature reading to the live dashboard state', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    const polling = TestBed.inject(DashboardPollingService);

    polling.latestDomainState.set({
      temperatures: {
        nozzle: { current: 223, target: 220 },
        bed: { current: 58, target: 60 },
        chamber: { current: 31 },
      },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance['dashboard']()?.temperatures).toEqual({
      chamber: 31,
      bed: 58,
      nozzle: 223,
    });
  });

  it('always applies the polled current reading, even after a target is submitted', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    const polling = TestBed.inject(DashboardPollingService);

    await fixture.componentInstance['updateTemperature']({ sensor: 'nozzle', value: 230 });
    polling.latestDomainState.set({ temperatures: { nozzle: { current: 210 } } });
    fixture.detectChanges();

    expect(fixture.componentInstance['dashboard']()?.temperatures.nozzle).toBe(210);
  });

  describe('settableTemperatureSensors (device-capability-driven, not hardcoded)', () => {
    it('excludes chamber when the active profile reports no chamber heater', async () => {
      const fixture = setUp(sampleData());
      await fixture.whenStable();

      expect(fixture.componentInstance['settableTemperatureSensors']()).toEqual(['bed', 'nozzle']);
    });

    it('includes chamber once the active profile reports a chamber heater, with zero template changes', async () => {
      const data = { ...sampleData(), deviceCapabilities: { hasChamberHeater: true } };
      const fixture = setUp(data);
      await fixture.whenStable();

      expect(fixture.componentInstance['settableTemperatureSensors']()).toEqual([
        'chamber',
        'bed',
        'nozzle',
      ]);
    });
  });

  it('moves to an in-bounds target and optimistically updates local coordinates', async () => {
    const fixture = setUp();
    await fixture.whenStable();

    await fixture.componentInstance['updateCoordinates']({ X: 125, Y: 125, Z: 20 });

    expect(commandPort.executed).toEqual([
      { type: 'set-coordinates', coordinates: { X: 125, Y: 125, Z: 20 } },
    ]);
    expect(fixture.componentInstance['dashboard']()?.coordinates).toEqual({
      X: 125,
      Y: 125,
      Z: 20,
    });
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

    expect(commandPort.executed).toEqual([expect.objectContaining({ type: 'set-navigation' })]);
    expect(fixture.componentInstance['dashboard']()?.navigation.axisPoints).toEqual(emptyPoints);
    expect(fixture.componentInstance['dashboard']()?.coordinates).toEqual({ X: 0, Y: 0, Z: 20 });
  });

  it('issues an unconditional home command without touching coordinates or calibration', async () => {
    const fixture = setUp();
    await fixture.whenStable();

    await fixture.componentInstance['home']();

    expect(commandPort.executed).toEqual([{ type: 'home' }]);
    expect(fixture.componentInstance['dashboard']()?.coordinates).toEqual({ X: 0, Y: 0, Z: 20 });
    expect(fixture.componentInstance['dashboard']()?.navigation.axisPoints).toEqual(
      sampleData().navigation.axisPoints,
    );
  });

  it('surfaces a command error when home is rejected', async () => {
    const fixture = setUp();
    await fixture.whenStable();
    commandPort.failNext = new CommandExecutionError({
      kind: 'unavailable',
      message: 'MQTT client is not connected',
    });

    await fixture.componentInstance['home']();

    expect(fixture.componentInstance['commandError']()).toEqual({
      kind: 'unavailable',
      message: 'MQTT client is not connected',
    });
  });

  describe('navigation calibration persistence', () => {
    const CALIBRATION_KEY = 'octo-management-dashboard-navigation-calibration-v1';

    afterEach(() => localStorage.removeItem(CALIBRATION_KEY));

    it('persists a saved navigation configuration so it survives a reload', async () => {
      const fixture = setUp();
      await fixture.whenStable();
      const configuration = {
        axisPoints: {
          X: { positive: { x: 10, y: 20 }, negative: { x: 30, y: 40 } },
          Y: { positive: null, negative: null },
          Z: { positive: null, negative: null },
        },
        hotendPoint: { x: 5, y: 6 },
        mainStep: 10,
        positionPanelPlacement: 'top-right' as const,
        steps: [1, 10],
        axisRanges: sampleData().axisRanges,
        axisColor: 'red',
        viewport: sampleData().navigation.viewport,
      };

      await fixture.componentInstance['updateNavigationConfiguration'](configuration);

      expect(fixture.componentInstance['dashboard']()?.navigation.axisPoints).toEqual(
        configuration.axisPoints,
      );

      // Simulate a reload: a fresh DashboardPage instance reading the same
      // localStorage-backed calibration store must restore these points
      // instead of falling back to the data source's static defaults.
      const reloadedFixture = setUp();
      await reloadedFixture.whenStable();

      expect(reloadedFixture.componentInstance['dashboard']()?.navigation.axisPoints).toEqual(
        configuration.axisPoints,
      );
      expect(reloadedFixture.componentInstance['dashboard']()?.navigation.hotendPoint).toEqual({
        x: 5,
        y: 6,
      });
    });

    it('does not persist axisRanges from the saved configuration (safety envelope always comes live)', async () => {
      const fixture = setUp();
      await fixture.whenStable();
      const configuration = {
        axisPoints: sampleData().navigation.axisPoints,
        hotendPoint: { x: 1, y: 1 },
        mainStep: 10,
        positionPanelPlacement: 'top-right' as const,
        steps: [1, 10],
        axisRanges: {
          X: { min: 0, max: 9999 },
          Y: { min: 0, max: 9999 },
          Z: { min: 0, max: 9999 },
        },
        axisColor: 'red',
        viewport: sampleData().navigation.viewport,
      };

      await fixture.componentInstance['updateNavigationConfiguration'](configuration);

      const stored = JSON.parse(localStorage.getItem(CALIBRATION_KEY)!);
      expect(stored.axisRanges).toBeUndefined();

      const reloadedFixture = setUp();
      await reloadedFixture.whenStable();
      expect(reloadedFixture.componentInstance['dashboard']()?.axisRanges).toEqual(
        sampleData().axisRanges,
      );
    });

    it('persists the cleared calibration after resetAxes, so a reload does not resurrect the old points', async () => {
      const fixture = setUp();
      await fixture.whenStable();
      const configuration = {
        axisPoints: {
          X: { positive: { x: 10, y: 20 }, negative: { x: 30, y: 40 } },
          Y: { positive: null, negative: null },
          Z: { positive: null, negative: null },
        },
        hotendPoint: { x: 5, y: 6 },
        mainStep: 10,
        positionPanelPlacement: 'top-right' as const,
        steps: [1, 10],
        axisRanges: sampleData().axisRanges,
        axisColor: 'red',
        viewport: sampleData().navigation.viewport,
      };
      await fixture.componentInstance['updateNavigationConfiguration'](configuration);

      const emptyPoints = {
        X: { positive: null, negative: null },
        Y: { positive: null, negative: null },
        Z: { positive: null, negative: null },
      };
      await fixture.componentInstance['resetAxes']({ axisPoints: emptyPoints, hotendPoint: null });

      const reloadedFixture = setUp();
      await reloadedFixture.whenStable();
      expect(reloadedFixture.componentInstance['dashboard']()?.navigation.axisPoints).toEqual(
        emptyPoints,
      );
    });
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

  describe('live-preview hub integration', () => {
    const HUB_BASE = 'http://localhost:10322';
    const MQTT_BASE = 'http://localhost:10320';

    async function flushRegistry(fixture: ReturnType<typeof setUp>, entries: unknown[]) {
      const httpMock = TestBed.inject(HttpTestingController);
      // DashboardPollingService/TelemetryPollingService also fire on
      // construction (real mqtt-puppeteer polling, unrelated to this
      // widget) — drain those so they don't trip httpMock.verify() below.
      httpMock.match(`${MQTT_BASE}/device_config/state/domain`).forEach((req) => req.flush({}));
      httpMock
        .match(`${MQTT_BASE}/telemetry/history`)
        .forEach((req) => req.flush({ capacity: 0, samples: [] }));
      // resolveCameras() only runs after loadData()'s mock-source promise
      // resolves (they're sequenced in the constructor), so the registry
      // request isn't issued until a microtask after setUp() returns.
      await fixture.whenStable();
      await Promise.resolve();
      const req = httpMock.expectOne(`${HUB_BASE}/api/v1/camera-registry`);
      req.flush({ items: entries, count: entries.length });
      await fixture.whenStable();
      await Promise.resolve();
      return httpMock;
    }

    it('resolves the printer camera by displayName, case-insensitively and trimmed', async () => {
      const fixture = setUp();
      const httpMock = await flushRegistry(fixture, [
        { cameraId: 'cam-other', baseUrl: 'http://cam-other', displayName: 'Some other camera' },
        { cameraId: 'cam-printer', baseUrl: 'http://cam-printer', displayName: '  KAMERA drukarki  ' },
      ]);

      expect(fixture.componentInstance['livePreviewHubAvailable']()).toBe(true);
      expect(fixture.componentInstance['dashboard']()?.livePreview.cameraId).toBe('cam-printer');
      expect(fixture.componentInstance['selectedCamera']()).toEqual(
        expect.objectContaining({ cameraId: 'cam-printer', baseUrl: 'http://cam-printer' }),
      );
      httpMock.verify();
    });

    it('falls back to the first registered camera when no entry matches the configured name', async () => {
      const fixture = setUp();
      const httpMock = await flushRegistry(fixture, [
        { cameraId: 'cam-other', baseUrl: 'http://cam-other', displayName: 'Some other camera' },
      ]);

      expect(fixture.componentInstance['livePreviewHubAvailable']()).toBe(true);
      expect(fixture.componentInstance['dashboard']()?.livePreview.cameraId).toBe('cam-other');
      httpMock.verify();
    });

    it('reports hubAvailable=false when the registry has no cameras at all', async () => {
      const fixture = setUp();
      const httpMock = await flushRegistry(fixture, []);

      expect(fixture.componentInstance['livePreviewHubAvailable']()).toBe(false);
      expect(fixture.componentInstance['dashboard']()?.livePreview.cameraId).toBe('');
      httpMock.verify();
    });

    it('awaits startLive and buildStreamUrl before flipping livePreview.active, and never calls a recording command', async () => {
      const fixture = setUp();
      const httpMock = await flushRegistry(fixture, [
        { cameraId: 'cam-printer', baseUrl: 'http://cam-printer', displayName: 'Kamera drukarki' },
      ]);

      const setActivePromise = fixture.componentInstance['setPreviewActive'](true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const startLiveReq = httpMock.expectOne(
        `${HUB_BASE}/api/v1/cameras/cam-printer/commands/start-live`,
      );
      expect(startLiveReq.request.method).toBe('POST');
      // Nothing recording-related must ever be dispatched by this flow.
      httpMock.expectNone(`${HUB_BASE}/api/v1/cameras/cam-printer/commands/start-recording`);
      httpMock.expectNone(`${HUB_BASE}/api/v1/cameras/cam-printer/commands/timed-recording`);

      // active must still be false: startLive has not resolved yet.
      expect(fixture.componentInstance['dashboard']()?.livePreview.active).toBe(false);
      startLiveReq.flush({});
      await new Promise((resolve) => setTimeout(resolve, 0));

      const tokenReq = httpMock.expectOne(`${HUB_BASE}/auth/stream-token`);
      // The stream token has resolved but the tokened stream URL has not
      // been built yet: active must still be false at this point too.
      expect(fixture.componentInstance['dashboard']()?.livePreview.active).toBe(false);
      tokenReq.flush({ streamToken: 'tok-123' });

      await setActivePromise;

      expect(fixture.componentInstance['dashboard']()?.livePreview.active).toBe(true);
      expect(fixture.componentInstance['livePreviewStreamUrl']()).toContain('streamToken=tok-123');
      httpMock.verify();
    });

    it('stops the old camera before applying a source switch made while streaming', async () => {
      const fixture = setUp();
      const httpMock = await flushRegistry(fixture, [
        { cameraId: 'cam-printer', baseUrl: 'http://cam-printer', displayName: 'Kamera drukarki' },
        { cameraId: 'cam-second', baseUrl: 'http://cam-second', displayName: 'Second camera' },
      ]);

      const startPromise = fixture.componentInstance['setPreviewActive'](true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      httpMock
        .expectOne(`${HUB_BASE}/api/v1/cameras/cam-printer/commands/start-live`)
        .flush({});
      await new Promise((resolve) => setTimeout(resolve, 0));
      httpMock.expectOne(`${HUB_BASE}/auth/stream-token`).flush({ streamToken: 'tok-1' });
      await startPromise;
      expect(fixture.componentInstance['dashboard']()?.livePreview.active).toBe(true);

      const switchPromise = fixture.componentInstance['setPreviewCamera']('cam-second');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const stopReq = httpMock.expectOne(
        `${HUB_BASE}/api/v1/cameras/cam-printer/commands/stop-live`,
      );
      expect(stopReq.request.method).toBe('POST');
      stopReq.flush({});

      await switchPromise;

      expect(fixture.componentInstance['dashboard']()?.livePreview.cameraId).toBe('cam-second');
      expect(fixture.componentInstance['livePreviewStreamUrl']()).toBe('');
      httpMock.verify();
    });
  });
});
