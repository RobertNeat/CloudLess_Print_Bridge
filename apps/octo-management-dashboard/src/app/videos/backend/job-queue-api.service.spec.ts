import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { JobDto } from './job-queue.models';
import { JobQueueApiService } from './job-queue-api.service';

describe('JobQueueApiService', () => {
  let httpMock: HttpTestingController;
  let service: JobQueueApiService;

  const job: JobDto = {
    requestId: 'capture-cam-1-123',
    cameraId: 'cam-1',
    cameraName: 'Front',
    kind: 'captures',
    command: 'capture',
    status: 'queued',
    createdAt: '2026-08-03T10:00:00Z',
    expectedFileName: 'capture-Front.jpg',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(JobQueueApiService);
  });

  afterEach(() => httpMock.verify());

  it('lists all jobs without a cameraId filter', async () => {
    const promise = service.list();

    const request = httpMock.expectOne('http://localhost:10322/api/v1/jobs');
    expect(request.request.method).toBe('GET');
    request.flush({ items: [job] });

    await expect(promise).resolves.toEqual([job]);
  });

  it('passes cameraId as a query param when filtering', async () => {
    const promise = service.list('cam-1');

    const request = httpMock.expectOne(
      (candidate) =>
        candidate.url === 'http://localhost:10322/api/v1/jobs' &&
        candidate.params.get('cameraId') === 'cam-1',
    );
    request.flush({ items: [job] });

    await expect(promise).resolves.toEqual([job]);
  });

  it('cancels a job by requestId, URL-encoded', async () => {
    const promise = service.cancel('capture cam-1/123');

    const request = httpMock.expectOne('http://localhost:10322/api/v1/jobs/capture%20cam-1%2F123');
    expect(request.request.method).toBe('DELETE');
    request.flush({ ...job, status: 'cancelled' });

    await expect(promise).resolves.toEqual(expect.objectContaining({ status: 'cancelled' }));
  });
});
