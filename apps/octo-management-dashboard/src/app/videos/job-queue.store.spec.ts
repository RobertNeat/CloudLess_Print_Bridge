import { TestBed } from '@angular/core/testing';
import { JobQueueApiService } from './backend/job-queue-api.service';
import type { JobDto } from './backend/job-queue.models';
import { JobQueueStore } from './job-queue.store';

function job(overrides: Partial<JobDto>): JobDto {
  return {
    requestId: 'req-1',
    cameraId: 'cam-1',
    kind: 'captures',
    command: 'capture',
    status: 'queued',
    createdAt: '2026-08-03T10:00:00Z',
    ...overrides,
  };
}

describe('JobQueueStore', () => {
  let list: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;
  let store: JobQueueStore;

  beforeEach(() => {
    list = vi.fn().mockResolvedValue([]);
    cancel = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: JobQueueApiService, useValue: { list, cancel } }],
    });
    store = TestBed.inject(JobQueueStore);
  });

  it('starts empty with panel closed and no active jobs', () => {
    expect(store.jobs()).toEqual([]);
    expect(store.panelOpen()).toBe(false);
    expect(store.activeCount()).toBe(0);
  });

  it('puts the running job first, then queued jobs in createdAt order, dropping terminal jobs', async () => {
    list.mockResolvedValue([
      job({ requestId: 'q2', status: 'queued', createdAt: '2026-08-03T10:02:00Z' }),
      job({ requestId: 'done-1', status: 'done', createdAt: '2026-08-03T09:00:00Z' }),
      job({ requestId: 'run-1', status: 'running', createdAt: '2026-08-03T10:01:00Z' }),
      job({ requestId: 'q1', status: 'queued', createdAt: '2026-08-03T10:00:30Z' }),
    ]);

    await store.refresh();

    expect(store.jobsFor('').map((j) => j.requestId)).toEqual(['run-1', 'q1', 'q2']);
  });

  it('counts only queued/running jobs as active', async () => {
    list.mockResolvedValue([
      job({ requestId: 'run-1', status: 'running' }),
      job({ requestId: 'q1', status: 'queued' }),
      job({ requestId: 'done-1', status: 'done' }),
    ]);

    await store.refresh();

    expect(store.activeCount()).toBe(2);
  });

  it('filters jobsFor(cameraId) to that camera only', async () => {
    list.mockResolvedValue([
      job({ requestId: 'a', cameraId: 'cam-1', status: 'queued' }),
      job({ requestId: 'b', cameraId: 'cam-2', status: 'queued' }),
    ]);

    await store.refresh();

    expect(store.jobsFor('cam-2').map((j) => j.requestId)).toEqual(['b']);
  });

  it('swallows list() failures, leaving the previous jobs in place', async () => {
    list.mockResolvedValue([job({ requestId: 'a' })]);
    await store.refresh();

    list.mockRejectedValueOnce(new Error('network error'));
    await store.refresh();

    expect(store.jobs().map((j) => j.requestId)).toEqual(['a']);
  });

  it('cancel() calls the API then always refreshes, even on failure (e.g. a 409 promotion race)', async () => {
    cancel.mockRejectedValueOnce(new Error('409 Conflict'));
    list.mockResolvedValue([job({ requestId: 'a', status: 'running' })]);

    await store.cancel('a');

    expect(cancel).toHaveBeenCalledWith('a');
    expect(list).toHaveBeenCalled();
    expect(store.jobs().map((j) => j.requestId)).toEqual(['a']);
  });

  it('findByRequestId locates a job by id', async () => {
    list.mockResolvedValue([job({ requestId: 'target', expectedFileName: 'capture-Front.jpg' })]);
    await store.refresh();

    expect(store.findByRequestId('target')?.expectedFileName).toBe('capture-Front.jpg');
    expect(store.findByRequestId('missing')).toBeUndefined();
  });

  it('setPanelOpen toggles the panelOpen signal', () => {
    store.setPanelOpen(true);
    expect(store.panelOpen()).toBe(true);
    store.setPanelOpen(false);
    expect(store.panelOpen()).toBe(false);
  });
});
