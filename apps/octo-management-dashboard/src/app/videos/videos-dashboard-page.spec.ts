import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { I18nService } from '../core/i18n.service';
import { CameraCommandApiService } from './backend/camera-command-api.service';
import { JobQueueApiService } from './backend/job-queue-api.service';
import type { JobDto } from './backend/job-queue.models';
import { JobQueueStore } from './job-queue.store';
import { VideoFiltersService } from './video-filters.service';
import { VIDEOS_REPOSITORY } from './videos-dashboard.ports';
import type { MediaItem, VideosDashboardData } from './videos-dashboard.models';
import { VideosDashboardPage } from './videos-dashboard-page';

const data: VideosDashboardData = {
  metrics: [{ code: 'status', valueCode: 'stream' }],
  sources: [
    {
      id: 'online',
      name: 'CAM_ONLINE',
      locationCode: 'printerChamber',
      status: 'online',
      previewUrl: '/images/live_preview.png',
      commandBaseUrl: 'http://camera-online',
    },
    {
      id: 'second',
      name: 'CAM_SECOND',
      locationCode: 'workshop',
      status: 'online',
      previewUrl: '/images/live_preview.png',
      commandBaseUrl: 'http://camera-second',
    },
    {
      id: 'offline',
      name: 'CAM_OFFLINE',
      locationCode: 'workshop',
      status: 'offline',
    },
  ],
  player: {
    active: false,
    selectedSourceId: 'online',
    resolution: 'auto',
    availableResolutions: ['auto'],
  },
  media: [
    {
      id: 'image',
      kind: 'image',
      name: 'capture.jpg',
      sourceId: 'online',
      capturedAt: '2026-08-03T10:00:00Z',
      thumbnailUrl: '/images/live_preview.png',
    },
  ],
};

describe('VideosDashboardPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MessageService,
        {
          provide: JobQueueApiService,
          useValue: { list: vi.fn().mockResolvedValue([]), cancel: vi.fn() },
        },
        {
          provide: VIDEOS_REPOSITORY,
          useValue: {
            load: async () => data,
            refreshSources: async () => data.sources,
            refreshMedia: async () => data.media,
          },
        },
      ],
    });
    TestBed.inject(I18nService).language.set('en');
  });

  it('localizes the feature and exposes camera selection semantics', async () => {
    const fixture = TestBed.createComponent(VideosDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Live camera');
    expect(element.textContent).toContain('Stream ready');
    const selected = element.querySelector('[role="radio"][aria-checked="true"]');
    expect(selected?.getAttribute('aria-label')).toContain('status: online');
  });

  it('opens a media preview without rewriting the search query', async () => {
    const fixture = TestBed.createComponent(VideosDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('.media-card') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(element.querySelector('.p-dialog')?.textContent).toContain('Media preview');
    expect(TestBed.inject(VideoFiltersService).query()).toBe('');
  });

  it('stops the stream and disables start after selecting an offline camera', async () => {
    const fixture = TestBed.createComponent(VideosDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const offlineButton = Array.from(element.querySelectorAll<HTMLButtonElement>('.source')).find(
      (button) => button.textContent?.includes('CAM_OFFLINE'),
    );
    offlineButton?.click();
    fixture.detectChanges();

    expect(element.textContent).toContain('Camera offline');
    const startButton = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Start'),
    );
    expect(startButton?.disabled).toBe(true);
  });

  it('refreshes only the media list after a delete, leaving player/source state untouched', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MessageService,
        {
          provide: JobQueueApiService,
          useValue: { list: vi.fn().mockResolvedValue([]), cancel: vi.fn() },
        },
        {
          provide: VIDEOS_REPOSITORY,
          useValue: {
            load: async () => data,
            refreshSources: async () => data.sources,
            refreshMedia: async () => [],
          },
        },
      ],
    });
    TestBed.inject(I18nService).language.set('en');

    const fixture = TestBed.createComponent(VideosDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      onMediaChanged: () => void;
      selectedSource: () => { id: string } | null;
    };
    instance.onMediaChanged();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.media-card')).toBeNull();
    // Source selection (from the original load) survives the media-only refresh.
    expect(instance.selectedSource()?.id).toBe('online');
  });

  it('surfaces a refresh error without hiding the already-loaded dashboard', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MessageService,
        {
          provide: JobQueueApiService,
          useValue: { list: vi.fn().mockResolvedValue([]), cancel: vi.fn() },
        },
        {
          provide: VIDEOS_REPOSITORY,
          useValue: {
            load: async () => data,
            refreshSources: async () => data.sources,
            refreshMedia: async () => {
              throw new Error('network error');
            },
          },
        },
      ],
    });
    TestBed.inject(I18nService).language.set('en');

    const fixture = TestBed.createComponent(VideosDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as { onMediaChanged: () => void };
    instance.onMediaChanged();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#videos-refresh-error')).not.toBeNull();
    // Stale-but-still-useful content stays visible instead of being replaced by a full-page error state.
    expect(element.querySelector('.media-card')).not.toBeNull();
  });
});

describe('VideosDashboardPage record dialog', () => {
  const queuedJob: JobDto = {
    requestId: '',
    cameraId: 'second',
    kind: 'captures',
    command: 'capture',
    status: 'running',
    createdAt: '2026-08-03T10:05:00Z',
    expectedFileName: 'capture-Second.jpg',
  };

  let captureImage: ReturnType<typeof vi.fn>;
  let refreshMedia: ReturnType<typeof vi.fn>;
  let jobList: ReturnType<typeof vi.fn>;
  let jobCancel: ReturnType<typeof vi.fn>;
  let addSpy: ReturnType<typeof vi.fn>;

  function configure(): void {
    TestBed.resetTestingModule();
    captureImage = vi.fn().mockResolvedValue(undefined);
    refreshMedia = vi.fn().mockResolvedValue([] as MediaItem[]);
    jobList = vi.fn().mockResolvedValue([] as JobDto[]);
    jobCancel = vi.fn().mockResolvedValue(queuedJob);
    TestBed.configureTestingModule({
      providers: [
        MessageService,
        {
          provide: CameraCommandApiService,
          useValue: {
            captureImage,
            startTimelapse: vi.fn().mockResolvedValue(undefined),
            startTimedRecording: vi.fn().mockResolvedValue(undefined),
            recordAudio: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: JobQueueApiService,
          useValue: { list: jobList, cancel: jobCancel },
        },
        {
          provide: VIDEOS_REPOSITORY,
          useValue: {
            load: async () => data,
            refreshSources: async () => data.sources,
            refreshMedia,
          },
        },
      ],
    });
    TestBed.inject(I18nService).language.set('en');
    addSpy = vi.spyOn(TestBed.inject(MessageService), 'add');
  }

  function openDialogFor(
    element: HTMLElement,
    fixture: { detectChanges: () => void },
    buttonId: string,
  ): void {
    (element.querySelector(`#${buttonId} button`) as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('dispatches to the dialog-selected source, not the globally-selected one, shows a queued toast with the filename, and never disables the button', async () => {
    configure();
    // Resolve list() with a job matching whatever requestId captureImage was actually called with, since it's generated at dispatch time (client-id + Date.now()).
    jobList.mockImplementation(async () => {
      const requestId = captureImage.mock.calls[0]?.[3] as string | undefined;
      return requestId ? [{ ...queuedJob, requestId }] : [];
    });

    const fixture = TestBed.createComponent(VideosDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    // Globally-selected source is "online"; explicitly pick "second" in the dialog instead.
    openDialogFor(element, fixture, 'media-capture-button');
    const sourceSelect = element.querySelector('#media-record-dialog-source') as HTMLElement & {
      value?: unknown;
    };
    expect(sourceSelect).not.toBeNull();

    const instance = fixture.componentInstance as unknown as {
      submitRecordDialog: (request: unknown) => void;
    };
    instance.submitRecordDialog({ action: 'capture', sourceId: 'second', resolution: 'VGA' });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(captureImage).toHaveBeenCalledWith(
      'second',
      'http://camera-second',
      'VGA',
      expect.stringContaining('capture-second-'),
    );

    // Button is never disabled/loading -- the same action can be retriggered immediately.
    const captureButton = element.querySelector(
      '#media-capture-button button',
    ) as HTMLButtonElement;
    expect(captureButton.className).not.toContain('p-button-loading');
    expect(captureButton.disabled).toBe(false);
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'info',
        detail: expect.stringContaining('capture-Second.jpg'),
      }),
    );
  });

  it('falls back to a generic queued toast when the job lookup finds no expectedFileName', async () => {
    configure();
    jobList.mockResolvedValue([]);
    const fixture = TestBed.createComponent(VideosDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const instance = fixture.componentInstance as unknown as {
      submitRecordDialog: (request: unknown) => void;
    };
    instance.submitRecordDialog({ action: 'capture', sourceId: 'online', resolution: 'VGA' });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info', detail: 'Recording job queued' }),
    );
    const captureButton = element.querySelector(
      '#media-capture-button button',
    ) as HTMLButtonElement;
    expect(captureButton.disabled).toBe(false);
  });

  it('shows an error toast when the command itself fails, and the button stays enabled', async () => {
    configure();
    captureImage.mockRejectedValueOnce(new Error('camera unreachable'));

    const fixture = TestBed.createComponent(VideosDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const instance = fixture.componentInstance as unknown as {
      submitRecordDialog: (request: unknown) => void;
    };
    instance.submitRecordDialog({ action: 'capture', sourceId: 'online', resolution: 'VGA' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const captureButton = element.querySelector(
      '#media-capture-button button',
    ) as HTMLButtonElement;
    expect(captureButton.className).not.toContain('p-button-loading');
    expect(captureButton.disabled).toBe(false);
    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('allows immediately re-opening the dialog for the same action right after a dispatch', async () => {
    configure();
    const fixture = TestBed.createComponent(VideosDashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const instance = fixture.componentInstance as unknown as {
      submitRecordDialog: (request: unknown) => void;
    };
    instance.submitRecordDialog({ action: 'capture', sourceId: 'online', resolution: 'VGA' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // No client-side lock -- the dialog opens again immediately for the same action.
    openDialogFor(element, fixture, 'media-capture-button');
    expect(element.querySelector('#media-record-dialog-source')).not.toBeNull();
  });

  it('refreshes the media grid once a job the page dispatched turns up done on a poll', async () => {
    configure();
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(VideosDashboardPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const instance = fixture.componentInstance as unknown as {
        submitRecordDialog: (request: unknown) => void;
        jobQueue: { setPanelOpen: (open: boolean) => void };
      };
      instance.submitRecordDialog({ action: 'capture', sourceId: 'online', resolution: 'VGA' });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const requestId = captureImage.mock.calls[0][3] as string;
      refreshMedia.mockClear();
      jobList.mockResolvedValue([{ ...queuedJob, requestId, status: 'done' }]);

      // Open the popover so the page's poll loop actually fetches on its next tick.
      instance.jobQueue.setPanelOpen(true);
      await vi.advanceTimersByTimeAsync(2500);
      await Promise.resolve();
      fixture.detectChanges();

      expect(refreshMedia).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
