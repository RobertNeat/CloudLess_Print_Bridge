import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/i18n.service';
import { JobQueueApiService } from '../backend/job-queue-api.service';
import type { JobDto } from '../backend/job-queue.models';
import { JobQueueStore } from '../job-queue.store';
import { VideoFiltersService } from '../video-filters.service';
import { VideoSearch } from './video-search';

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

describe('VideoSearch job queue popover', () => {
  let list: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    list = vi.fn().mockResolvedValue([]);
    cancel = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: JobQueueApiService, useValue: { list, cancel } }],
    });
    TestBed.inject(I18nService).language.set('en');
    TestBed.inject(VideoFiltersService).setSources([
      { id: 'cam-1', name: 'Front' },
      { id: 'cam-2', name: 'Back' },
    ]);
  });

  it('is closed by default and opens the jobs popover on click, marking the store panelOpen', async () => {
    const fixture = TestBed.createComponent(VideoSearch);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#video-jobs-popover')).toBeNull();

    (element.querySelector('#video-jobs-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('#video-jobs-popover')).not.toBeNull();
    expect(TestBed.inject(JobQueueStore).panelOpen()).toBe(true);
    expect(list).toHaveBeenCalled();
  });

  it('shows the empty state when there are no jobs', async () => {
    const fixture = TestBed.createComponent(VideoSearch);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#video-jobs-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('#video-jobs-empty')).not.toBeNull();
  });

  it('renders the running job first with a spinner and no cancel button, then queued jobs with a gray dot and a cancel button', async () => {
    list.mockResolvedValue([
      job({ requestId: 'q1', status: 'queued', expectedFileName: 'capture-Front-1.jpg' }),
      job({ requestId: 'run-1', status: 'running', expectedFileName: 'recording-Front.mp4' }),
    ]);

    const fixture = TestBed.createComponent(VideoSearch);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#video-jobs-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const items = Array.from(element.querySelectorAll('#video-jobs-list .jobs-list__item'));
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('recording-Front.mp4');
    expect(items[0].querySelector('.pi-spin')).not.toBeNull();
    expect(items[0].querySelector('.jobs-list__cancel')).toBeNull();

    expect(items[1].textContent).toContain('capture-Front-1.jpg');
    expect(items[1].querySelector('.jobs-list__dot')).not.toBeNull();
    expect(items[1].querySelector('.jobs-list__cancel')).not.toBeNull();
  });

  it('cancels a queued job via the x button and keeps the popover open', async () => {
    list.mockResolvedValue([job({ requestId: 'q1', status: 'queued' })]);

    const fixture = TestBed.createComponent(VideoSearch);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#video-jobs-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    list.mockResolvedValue([]);
    (element.querySelector('#video-jobs-cancel-q1') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cancel).toHaveBeenCalledWith('q1');
    // Popover stays open after the row is removed -- the outside-click
    // listener must not mistake the now-detached row for an outside click.
    expect(element.querySelector('#video-jobs-popover')).not.toBeNull();
    expect(element.querySelector('#video-jobs-empty')).not.toBeNull();
  });

  it('treats a cancel 409 (already promoted to running) as benign and just refreshes', async () => {
    list.mockResolvedValue([job({ requestId: 'q1', status: 'queued' })]);
    cancel.mockRejectedValueOnce(new Error('409 Conflict'));

    const fixture = TestBed.createComponent(VideoSearch);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#video-jobs-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    list.mockResolvedValue([job({ requestId: 'q1', status: 'running' })]);
    (element.querySelector('#video-jobs-cancel-q1') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelectorAll('.jobs-list__item')).toHaveLength(1);
    expect(element.querySelector('.jobs-list__cancel')).toBeNull();
  });

  it('narrows the job list to the selected camera source', async () => {
    list.mockResolvedValue([
      job({ requestId: 'a', cameraId: 'cam-1', status: 'queued' }),
      job({ requestId: 'b', cameraId: 'cam-2', status: 'queued' }),
    ]);

    const fixture = TestBed.createComponent(VideoSearch);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#video-jobs-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelectorAll('#video-jobs-list .jobs-list__item')).toHaveLength(2);

    const instance = fixture.componentInstance as unknown as {
      jobSourceId: { set: (value: string) => void };
    };
    instance.jobSourceId.set('cam-2');
    fixture.detectChanges();

    const remaining = element.querySelectorAll('#video-jobs-list .jobs-list__item');
    expect(remaining).toHaveLength(1);
  });

  it('shows a badge with the active job count, even while the popover is closed', async () => {
    list.mockResolvedValue([
      job({ requestId: 'a', status: 'queued' }),
      job({ requestId: 'b', status: 'running' }),
    ]);

    const fixture = TestBed.createComponent(VideoSearch);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#video-jobs-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Close it again -- the badge (driven by the store, not popover-open state) should persist.
    (element.querySelector('#video-jobs-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(element.querySelector('#video-jobs-badge')?.textContent?.trim()).toBe('2');
  });
});
