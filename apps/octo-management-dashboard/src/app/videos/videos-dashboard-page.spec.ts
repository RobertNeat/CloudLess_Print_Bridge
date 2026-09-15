import { TestBed } from '@angular/core/testing';
import { I18nService } from '../core/i18n.service';
import { VideoFiltersService } from './video-filters.service';
import { VIDEOS_REPOSITORY } from './videos-dashboard.ports';
import type { VideosDashboardData } from './videos-dashboard.models';
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
