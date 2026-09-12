import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TelemetryHistoryService } from './telemetry-history.service';

describe('TelemetryHistoryService', () => {
  let httpMock: HttpTestingController;
  let service: TelemetryHistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(TelemetryHistoryService);
  });

  afterEach(() => httpMock.verify());

  it('fetches the telemetry history buffer', async () => {
    const promise = service.fetchHistory();

    httpMock.expectOne('http://localhost:10320/telemetry/history').flush({
      capacity: 720,
      samples: [],
    });

    await expect(promise).resolves.toEqual({ capacity: 720, samples: [] });
  });

  it('rejects on HTTP failure', async () => {
    const promise = service.fetchHistory();

    httpMock
      .expectOne('http://localhost:10320/telemetry/history')
      .flush({ statusCode: 503, message: 'MQTT client is not connected' }, { status: 503, statusText: 'x' });

    await expect(promise).rejects.toBeTruthy();
  });
});
