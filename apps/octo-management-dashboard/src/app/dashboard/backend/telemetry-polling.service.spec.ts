import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TelemetryPollingService } from './telemetry-polling.service';
import { TelemetryHistoryService } from './telemetry-history.service';
import type { TelemetryHistoryResponseDto } from './mqtt-puppeteer-api.types';
import { fakeAsync, tick } from '@angular/core/testing';

describe('TelemetryPollingService', () => {
  let service: TelemetryPollingService;
  let telemetryService: TelemetryHistoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TelemetryPollingService,
        TelemetryHistoryService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(TelemetryPollingService);
    telemetryService = TestBed.inject(TelemetryHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    service.stop();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('initializes latestHistory as null', () => {
    expect(service.latestHistory()).toBeNull();
  });

  it('calls fetchHistory immediately on start()', fakeAsync(() => {
    // Start the polling service
    service.start();

    // Expect an immediate request
    const req = httpMock.expectOne((req) => req.url.includes('/telemetry/history'));
    req.flush({
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

    // latestHistory should now be populated
    expect(service.latestHistory()).toBeTruthy();
    expect(service.latestHistory()?.samples).toHaveLength(1);
  }));

  it('polls on an interval, updating latestHistory each time', fakeAsync(() => {
    const pollInterval = 1000; // Short interval for testing
    service.start(pollInterval);

    // First request (immediate)
    const req1 = httpMock.expectOne((req) => req.url.includes('/telemetry/history'));
    const firstResponse: TelemetryHistoryResponseDto = {
      capacity: 10,
      samples: [
        {
          capturedAt: '2026-09-12T10:00:00.000Z',
          progressPercent: 0,
          nozzleTemperatureCurrent: null,
          nozzleTemperatureTarget: null,
          bedTemperatureCurrent: null,
          bedTemperatureTarget: null,
          chamberTemperatureCurrent: null,
          coolingFanPercent: null,
          auxiliaryFanPercent: null,
        },
      ],
    };
    req1.flush(firstResponse);

    const firstHistory = service.latestHistory();
    expect(firstHistory?.samples).toHaveLength(1);
    expect(firstHistory?.samples[0].progressPercent).toBe(0);

    // Wait for the interval to trigger
    tick(pollInterval);

    // Second request should occur
    const req2 = httpMock.expectOne((req) => req.url.includes('/telemetry/history'));
    const secondResponse: TelemetryHistoryResponseDto = {
      capacity: 10,
      samples: [
        {
          capturedAt: '2026-09-12T10:00:00.000Z',
          progressPercent: 0,
          nozzleTemperatureCurrent: null,
          nozzleTemperatureTarget: null,
          bedTemperatureCurrent: null,
          bedTemperatureTarget: null,
          chamberTemperatureCurrent: null,
          coolingFanPercent: null,
          auxiliaryFanPercent: null,
        },
        {
          capturedAt: '2026-09-12T10:00:10.000Z',
          progressPercent: 10,
          nozzleTemperatureCurrent: null,
          nozzleTemperatureTarget: null,
          bedTemperatureCurrent: null,
          bedTemperatureTarget: null,
          chamberTemperatureCurrent: null,
          coolingFanPercent: null,
          auxiliaryFanPercent: null,
        },
      ],
    };
    req2.flush(secondResponse);

    const secondHistory = service.latestHistory();
    expect(secondHistory).not.toBe(firstHistory);
    expect(secondHistory?.samples).toHaveLength(2);
    expect(secondHistory?.samples[1].progressPercent).toBe(10);
  }));

  it('does not start polling again if already started', fakeAsync(() => {
    service.start(1000);

    // First request
    httpMock.expectOne((req) => req.url.includes('/telemetry/history')).flush({
      capacity: 10,
      samples: [],
    });

    // Call start again
    service.start(1000);

    // Tick and expect only one more request (not two)
    tick(1000);
    httpMock.expectOne((req) => req.url.includes('/telemetry/history')).flush({
      capacity: 10,
      samples: [],
    });

    // No more requests should be pending
    httpMock.expectNone((req) => req.url.includes('/telemetry/history'));
  }));

  it('stops polling when stop() is called', fakeAsync(() => {
    service.start(1000);

    httpMock.expectOne((req) => req.url.includes('/telemetry/history')).flush({
      capacity: 10,
      samples: [],
    });

    service.stop();

    // Advance time past the interval
    tick(1000);

    // No more requests should occur
    httpMock.expectNone((req) => req.url.includes('/telemetry/history'));
  }));
});
