import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TelemetryHistoryService } from './telemetry-history.service';
import { TelemetryPollingService } from './telemetry-polling.service';
import type { TelemetryHistoryResponseDto } from './mqtt-puppeteer-api.types';

/**
 * Uses Vitest's own fake timers (vi.useFakeTimers/advanceTimersByTimeAsync),
 * not Angular's fakeAsync/tick — this project's `ng test` runs on
 * @angular/build:unit-test (Vitest), which doesn't ship zone.js/testing, so
 * fakeAsync() fails at runtime with "zone-testing.js is needed" before a
 * single assertion runs. Every other async spec in this codebase already
 * uses plain await + HttpTestingController, matching that convention here.
 */
describe('TelemetryPollingService', () => {
  let service: TelemetryPollingService;
  let httpMock: HttpTestingController;

  const emptyResponse: TelemetryHistoryResponseDto = { capacity: 10, samples: [] };

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        TelemetryPollingService,
        TelemetryHistoryService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(TelemetryPollingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    service.stop();
    vi.useRealTimers();
  });

  it('initializes latestHistory as null', () => {
    expect(service.latestHistory()).toBeNull();
  });

  it('fetches immediately on start(), without waiting for the first interval tick', async () => {
    service.start(1000);
    await vi.advanceTimersByTimeAsync(0);

    httpMock.expectOne((req) => req.url.includes('/telemetry/history')).flush({
      capacity: 10,
      samples: [
        {
          capturedAt: '2026-09-12T10:00:00.000Z',
          progressPercent: 50,
          nozzleTemperatureCurrent: 210,
          nozzleTemperatureTarget: 220,
          bedTemperatureCurrent: 55,
          bedTemperatureTarget: 60,
          chamberTemperatureCurrent: null,
          coolingFanPercent: 30,
          auxiliaryFanPercent: 10,
        },
      ],
    } as TelemetryHistoryResponseDto);
    await vi.advanceTimersByTimeAsync(0);

    expect(service.latestHistory()?.samples).toHaveLength(1);
  });

  it('polls again on each interval tick, replacing latestHistory with a fresh object', async () => {
    service.start(1000);
    await vi.advanceTimersByTimeAsync(0);

    httpMock.expectOne((req) => req.url.includes('/telemetry/history')).flush({
      capacity: 10,
      samples: [{ ...sampleAt('2026-09-12T10:00:00.000Z', 0) }],
    });
    await vi.advanceTimersByTimeAsync(0);
    const firstHistory = service.latestHistory();
    expect(firstHistory?.samples).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    httpMock.expectOne((req) => req.url.includes('/telemetry/history')).flush({
      capacity: 10,
      samples: [sampleAt('2026-09-12T10:00:00.000Z', 0), sampleAt('2026-09-12T10:00:10.000Z', 10)],
    });
    await vi.advanceTimersByTimeAsync(0);

    const secondHistory = service.latestHistory();
    expect(secondHistory).not.toBe(firstHistory);
    expect(secondHistory?.samples).toHaveLength(2);
    expect(secondHistory?.samples[1].progressPercent).toBe(10);
  });

  it('does not start a second interval if start() is called again while already running', async () => {
    service.start(1000);
    await vi.advanceTimersByTimeAsync(0);
    httpMock.expectOne((req) => req.url.includes('/telemetry/history')).flush(emptyResponse);

    service.start(1000);
    await vi.advanceTimersByTimeAsync(1000);

    httpMock.expectOne((req) => req.url.includes('/telemetry/history')).flush(emptyResponse);
    httpMock.expectNone((req) => req.url.includes('/telemetry/history'));
  });

  it('stops polling once stop() is called', async () => {
    service.start(1000);
    await vi.advanceTimersByTimeAsync(0);
    httpMock.expectOne((req) => req.url.includes('/telemetry/history')).flush(emptyResponse);

    service.stop();
    await vi.advanceTimersByTimeAsync(1000);

    httpMock.expectNone((req) => req.url.includes('/telemetry/history'));
  });
});

function sampleAt(capturedAt: string, progressPercent: number) {
  return {
    capturedAt,
    progressPercent,
    nozzleTemperatureCurrent: null,
    nozzleTemperatureTarget: null,
    bedTemperatureCurrent: null,
    bedTemperatureTarget: null,
    chamberTemperatureCurrent: null,
    coolingFanPercent: null,
    auxiliaryFanPercent: null,
  };
}
