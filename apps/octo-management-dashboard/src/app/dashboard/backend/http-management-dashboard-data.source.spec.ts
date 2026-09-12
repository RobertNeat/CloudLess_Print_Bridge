import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpManagementDashboardDataSource } from './http-management-dashboard-data.source';
import type { PrinterDomainModelDto, TelemetrySampleDto } from './mqtt-puppeteer-api.types';

describe('HttpManagementDashboardDataSource', () => {
  let httpMock: HttpTestingController;
  let source: HttpManagementDashboardDataSource;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    source = TestBed.inject(HttpManagementDashboardDataSource);
  });

  afterEach(() => httpMock.verify());

  const validEnvelope = {
    id: 'bambu-lab-a1',
    topology: { unitCount: 1, slotsPerUnit: 4, externalSpool: true },
    machineEnvelope: {
      x: { minimum: 0, maximum: 256 },
      y: { minimum: 0, maximum: 256 },
      z: { minimum: 20, maximum: 240 },
    },
  };

  function flushDomain(domain: PrinterDomainModelDto, samples: TelemetrySampleDto[] = []): void {
    httpMock.expectOne('http://localhost:10320/device_config/state/domain').flush(domain);
    httpMock
      .expectOne('http://localhost:10320/telemetry/history')
      .flush({ capacity: 720, samples });
    httpMock.expectOne('http://localhost:10320/device_config/profile').flush(validEnvelope);
  }

  it('composes a fully valid ManagementDashboardData from a rich domain model', async () => {
    const promise = source.load();

    flushDomain({
      job: { status: 'running', progressPercent: 42, currentLayer: 10, totalLayers: 100 },
      lightOn: true,
      fans: { coolingPercent: 60 },
      speedPercent: 100,
      temperatures: {
        nozzle: { current: 210, target: 220 },
        bed: { current: 55, target: 60 },
        chamber: { current: 30 },
      },
    });

    const data = await promise;
    expect(data.printJob.status).toBe('printing');
    expect(data.printJob.progress).toBe(42);
    expect(data.controls.lightEnabled).toBe(true);
    expect(data.controls.fansEnabled).toBe(true);
    expect(data.controls.fanSpeed).toBe(60);
    expect(data.temperatures).toEqual({ chamber: 30, bed: 55, nozzle: 210 });
  });

  it('maps job fileName and remainingSeconds to name and a formatted duration', async () => {
    const promise = source.load();

    flushDomain({ job: { status: 'running', fileName: 'benchy.gcode', remainingSeconds: 3720 } });

    const data = await promise;
    expect(data.printJob.name).toBe('benchy.gcode');
    expect(data.printJob.estimatedPrintTime).not.toBe('—');
  });

  it('maps an idle/absent job status to a terminal, non-misleading status', async () => {
    const promise = source.load();

    flushDomain({ job: { status: 'idle' } });

    const data = await promise;
    expect(data.printJob.status).toBe('completed');
  });

  it('composes valid data from a nearly-empty domain model without throwing', async () => {
    const promise = source.load();

    flushDomain({});

    const data = await promise;
    expect(data.printJob.progress).toBe(0);
    expect(data.printJob.status).toBe('completed');
    expect(data.printJob.name).toBe('Aktualne zadanie');
    expect(data.printJob.estimatedPrintTime).toBe('—');
    expect(data.controls.fansEnabled).toBe(false);
    expect(data.temperatures).toEqual({ chamber: null, bed: null, nozzle: null });
    // Placeholder fields are present as non-empty strings, not undefined —
    // the validator requires this and a real UI shouldn't render "undefined".
    expect(typeof data.printJob.name).toBe('string');
    expect(data.printJob.name.length).toBeGreaterThan(0);
  });

  it('never fabricates a chamber target temperature series', async () => {
    const promise = source.load();

    flushDomain({ temperatures: { chamber: { current: 28 } } }, [
      {
        capturedAt: '2026-09-12T10:00:00.000Z',
        progressPercent: null,
        nozzleTemperatureCurrent: null,
        nozzleTemperatureTarget: null,
        bedTemperatureCurrent: null,
        bedTemperatureTarget: null,
        chamberTemperatureCurrent: 28,
        coolingFanPercent: null,
        auxiliaryFanPercent: null,
      },
    ]);

    const data = await promise;
    expect(
      data.charts.temperature.datasets.some((d) => d.labelKey === 'chart.series.chamberTarget'),
    ).toBe(false);
    expect(
      data.charts.temperature.datasets.some((d) => d.labelKey === 'chart.series.chamberCurrent'),
    ).toBe(true);
  });

  it('falls back to an empty domain snapshot (not a total load failure) when device_config/state/domain fails', async () => {
    // A domain-state hiccup (backend restarting, or its MQTT client still
    // connecting after onModuleInit — see EMPTY_DOMAIN_STATE in the source)
    // must not blank the whole dashboard behind
    // "Nie udało się wczytać danych dashboardu."
    const promise = source.load();

    httpMock
      .expectOne('http://localhost:10320/device_config/state/domain')
      .flush(
        { statusCode: 503, message: 'MQTT client is not connected' },
        { status: 503, statusText: 'x' },
      );
    httpMock
      .expectOne('http://localhost:10320/telemetry/history')
      .flush({ capacity: 720, samples: [] });
    httpMock.expectOne('http://localhost:10320/device_config/profile').flush(validEnvelope);

    const data = await promise;
    expect(data.printJob.status).toBe('completed');
    expect(data.controls.lightEnabled).toBe(false);
    expect(data.positionSource).toBe('unknown');
  });

  it('falls back to an empty telemetry history (not a total load failure) when telemetry/history fails', async () => {
    const promise = source.load();

    httpMock.expectOne('http://localhost:10320/device_config/state/domain').flush({});
    httpMock
      .expectOne('http://localhost:10320/telemetry/history')
      .flush(
        { statusCode: 503, message: 'MQTT client is not connected' },
        { status: 503, statusText: 'x' },
      );
    httpMock.expectOne('http://localhost:10320/device_config/profile').flush(validEnvelope);

    const data = await promise;
    expect(data.charts.progress.labels).toEqual([]);
    expect(data.charts.progress.datasets.every((d) => d.data.length === 0)).toBe(true);
  });

  it('composes valid data when all three backend requests fail simultaneously (never a total blank-out)', async () => {
    const promise = source.load();

    httpMock
      .expectOne('http://localhost:10320/device_config/state/domain')
      .flush({ statusCode: 0, message: 'network' }, { status: 0, statusText: 'x' });
    httpMock
      .expectOne('http://localhost:10320/telemetry/history')
      .flush({ statusCode: 0, message: 'network' }, { status: 0, statusText: 'x' });
    httpMock
      .expectOne('http://localhost:10320/device_config/profile')
      .flush({ statusCode: 0, message: 'network' }, { status: 0, statusText: 'x' });

    const data = await promise;
    expect(data.printJob.status).toBe('completed');
    expect(data.axisRanges).toEqual({
      X: { min: 0, max: 0 },
      Y: { min: 0, max: 0 },
      Z: { min: 0, max: 0 },
    });
    expect(data.positionSource).toBe('unknown');
    expect(data.deviceCapabilities).toEqual({ hasChamberHeater: false });
  });

  it('falls back to a zero-width envelope (fail closed) when the profile request fails, never a numeric guess', async () => {
    const promise = source.load();

    httpMock.expectOne('http://localhost:10320/device_config/state/domain').flush({});
    httpMock
      .expectOne('http://localhost:10320/telemetry/history')
      .flush({ capacity: 720, samples: [] });
    httpMock
      .expectOne('http://localhost:10320/device_config/profile')
      .flush(
        { statusCode: 503, message: 'MQTT client is not connected' },
        { status: 503, statusText: 'x' },
      );

    const data = await promise;
    expect(data.axisRanges).toEqual({
      X: { min: 0, max: 0 },
      Y: { min: 0, max: 0 },
      Z: { min: 0, max: 0 },
    });
  });

  it('reports the tracked position source and coordinates from the backend', async () => {
    const promise = source.load();

    flushDomain({
      position: {
        x: 125,
        y: 100,
        z: 30,
        homed: true,
        source: 'commanded',
        updatedAt: '2026-09-12T10:00:00.000Z',
      },
    });

    const data = await promise;
    expect(data.coordinates).toEqual({ X: 125, Y: 100, Z: 30 });
    expect(data.positionSource).toBe('commanded');
  });

  it('reports positionSource unknown and does not present the coordinates placeholder as real when unhomed', async () => {
    const promise = source.load();

    flushDomain({
      position: { x: null, y: null, z: null, homed: false, source: 'unknown', updatedAt: null },
    });

    const data = await promise;
    expect(data.positionSource).toBe('unknown');
    expect(data.coordinates).toEqual({ X: 0, Y: 0, Z: 0 });
  });

  describe('deviceCapabilities', () => {
    it('surfaces hasChamberHeater from the profile response', async () => {
      const promise = source.load();

      httpMock.expectOne('http://localhost:10320/device_config/state/domain').flush({});
      httpMock
        .expectOne('http://localhost:10320/telemetry/history')
        .flush({ capacity: 720, samples: [] });
      httpMock.expectOne('http://localhost:10320/device_config/profile').flush({
        ...validEnvelope,
        heaterCapabilities: { hasChamberHeater: true },
      });

      const data = await promise;
      expect(data.deviceCapabilities).toEqual({ hasChamberHeater: true });
    });

    it('reports the real A1 profile as having no chamber heater', async () => {
      const promise = source.load();

      flushDomain({});

      const data = await promise;
      expect(data.deviceCapabilities).toEqual({ hasChamberHeater: false });
    });

    it('fails closed to no chamber heater when the profile request fails entirely', async () => {
      const promise = source.load();

      httpMock.expectOne('http://localhost:10320/device_config/state/domain').flush({});
      httpMock
        .expectOne('http://localhost:10320/telemetry/history')
        .flush({ capacity: 720, samples: [] });
      httpMock
        .expectOne('http://localhost:10320/device_config/profile')
        .flush(
          { statusCode: 503, message: 'MQTT client is not connected' },
          { status: 503, statusText: 'x' },
        );

      const data = await promise;
      expect(data.deviceCapabilities).toEqual({ hasChamberHeater: false });
    });
  });
});
