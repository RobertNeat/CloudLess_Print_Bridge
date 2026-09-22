import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/i18n.service';
import { MediaLibraryApiService } from '../backend/media-library-api.service';
import { MediaTokenApiService } from '../backend/media-token-api.service';
import type { MediaItem } from '../videos-dashboard.models';
import { MediaPreview } from './media-preview';

const recording: MediaItem = {
  id: 'recording:camera-1:req-1',
  kind: 'recording',
  name: 'req-1.mp4',
  sourceId: 'camera-1',
  requestId: 'req-1',
  capturedAt: '2026-08-03T10:00:00Z',
  downloadUrl: 'http://hub/api/v1/recordings/camera-1/req-1/file',
};

const live: MediaItem = {
  id: 'live:camera-1:live-1',
  kind: 'live',
  name: 'live-1.mp4',
  sourceId: 'camera-1',
  requestId: 'live-1',
  capturedAt: '2026-08-03T10:00:00Z',
  downloadUrl: 'http://hub/api/v1/live/camera-1/live-1/file',
};

const timelapse: MediaItem = {
  id: 'timelapse:camera-1:tl-1',
  kind: 'timelapse',
  name: 'tl-1.mp4',
  sourceId: 'camera-1',
  requestId: 'tl-1',
  capturedAt: '2026-08-03T10:00:00Z',
  downloadUrl: 'http://hub/api/v1/timelapses/camera-1/tl-1/file',
};

const image: MediaItem = {
  id: 'image:camera-1:img-1',
  kind: 'image',
  name: 'img-1.jpg',
  sourceId: 'camera-1',
  requestId: 'img-1',
  capturedAt: '2026-08-03T10:00:00Z',
  downloadUrl: 'http://hub/api/v1/captures/camera-1/img-1/file',
};

const audio: MediaItem = {
  id: 'audio:camera-1:aud-1',
  kind: 'audio',
  name: 'aud-1.wav',
  sourceId: 'camera-1',
  requestId: 'aud-1',
  capturedAt: '2026-08-03T10:00:00Z',
  downloadUrl: 'http://hub/api/v1/audio/camera-1/aud-1/file',
};

describe('MediaPreview playback', () => {
  let acquire: ReturnType<typeof vi.fn>;
  let deleteMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    acquire = vi.fn().mockResolvedValue('tok-123');
    deleteMedia = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MediaLibraryApiService,
          useValue: { delete: deleteMedia },
        },
        {
          provide: MediaTokenApiService,
          useValue: {
            acquire,
            buildTokenedUrl: (url: string, token: string) => `${url}?mediaToken=${token}`,
          },
        },
      ],
    });
    TestBed.inject(I18nService).language.set('en');
  });

  it('acquires a recording token and sets a tokened mp4 src directly, with no transcode call', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', recording);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(acquire).toHaveBeenCalledWith({
      kind: 'recording',
      cameraId: 'camera-1',
      requestId: 'req-1',
    });
    expect((fixture.componentInstance as unknown as { mp4Src: () => string }).mp4Src()).toBe(
      `${recording.downloadUrl}?mediaToken=tok-123`,
    );
  });

  it('acquires a live token and plays a live item through Mp4Player', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', live);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(acquire).toHaveBeenCalledWith({
      kind: 'live',
      cameraId: 'camera-1',
      requestId: 'live-1',
    });
    expect((fixture.componentInstance as unknown as { mp4Src: () => string }).mp4Src()).toBe(
      `${live.downloadUrl}?mediaToken=tok-123`,
    );
    expect(fixture.nativeElement.querySelector('#media-preview-mp4-player')).not.toBeNull();
  });

  it('acquires a timelapse token and plays a timelapse through Mp4Player', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', timelapse);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(acquire).toHaveBeenCalledWith({
      kind: 'timelapse',
      cameraId: 'camera-1',
      requestId: 'tl-1',
    });
    expect((fixture.componentInstance as unknown as { mp4Src: () => string }).mp4Src()).toBe(
      `${timelapse.downloadUrl}?mediaToken=tok-123`,
    );
  });

  it('acquires a capture token and sets a tokened image src for an image item', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', image);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(acquire).toHaveBeenCalledWith({
      kind: 'capture',
      cameraId: 'camera-1',
      requestId: 'img-1',
    });
    expect(fixture.nativeElement.querySelector('#media-preview-image')?.getAttribute('src')).toBe(
      `${image.downloadUrl}?mediaToken=tok-123`,
    );
  });

  it('acquires an audio token and sets a tokened audio src', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', audio);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(acquire).toHaveBeenCalledWith({
      kind: 'audio',
      cameraId: 'camera-1',
      requestId: 'aud-1',
    });
    expect(fixture.nativeElement.querySelector('#media-preview-audio')?.getAttribute('src')).toBe(
      `${audio.downloadUrl}?mediaToken=tok-123`,
    );
  });

  it('re-acquires a token on a player playback error', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', recording);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(acquire).toHaveBeenCalledTimes(1);

    acquire.mockResolvedValueOnce('tok-456');
    (
      fixture.componentInstance as unknown as { onMp4PlaybackError: () => void }
    ).onMp4PlaybackError();
    await fixture.whenStable();

    expect(acquire).toHaveBeenCalledTimes(2);
    expect((fixture.componentInstance as unknown as { mp4Src: () => string }).mp4Src()).toBe(
      `${recording.downloadUrl}?mediaToken=tok-456`,
    );
  });

  it('gives up after MAX_MP4_PLAYBACK_RETRIES consecutive playback errors', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', recording);
    fixture.detectChanges();
    await fixture.whenStable();

    const instance = fixture.componentInstance as unknown as {
      onMp4PlaybackError: () => void;
      mp4PlaybackFailed: () => boolean;
    };
    for (let i = 0; i < 4; i += 1) {
      instance.onMp4PlaybackError();
      await fixture.whenStable();
    }

    expect(instance.mp4PlaybackFailed()).toBe(true);
  });

  it('deletes on a single click of the delete button, with no confirmation step', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', recording);
    const changedSpy = vi.fn();
    fixture.componentInstance.changed.subscribe(changedSpy);
    const closedSpy = vi.fn();
    fixture.componentInstance.closed.subscribe(closedSpy);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#media-preview-delete-confirm')).toBeNull();

    (element.querySelector('#media-preview-delete-button button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(deleteMedia).toHaveBeenCalledWith('recording', 'camera-1', 'req-1');
    expect(deleteMedia).toHaveBeenCalledTimes(1);
    expect(changedSpy).toHaveBeenCalledTimes(1);
    expect(closedSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves the delete button usable when a second item is opened after a successful delete', async () => {
    const otherRecording: MediaItem = {
      ...recording,
      id: 'recording:camera-1:req-2',
      requestId: 'req-2',
      downloadUrl: 'http://hub/api/v1/recordings/camera-1/req-2/file',
    };

    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', recording);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#media-preview-delete-button button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(deleteMedia).toHaveBeenCalledTimes(1);

    // The dialog is reused for a new item (parent sets `item` again rather than
    // destroying/recreating the component), simulating opening a second file
    // right after the first one was deleted.
    fixture.componentRef.setInput('item', otherRecording);
    fixture.detectChanges();
    await fixture.whenStable();

    const deleteButton = element.querySelector(
      '#media-preview-delete-button button',
    ) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(false);

    deleteButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(deleteMedia).toHaveBeenCalledWith('recording', 'camera-1', 'req-2');
    expect(deleteMedia).toHaveBeenCalledTimes(2);
  });

  it('surfaces an action error and does not close when delete fails', async () => {
    deleteMedia.mockRejectedValueOnce(new Error('network error'));
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', recording);
    const closedSpy = vi.fn();
    fixture.componentInstance.closed.subscribe(closedSpy);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#media-preview-delete-button button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(closedSpy).not.toHaveBeenCalled();
    expect(element.querySelector('.media-preview__error')?.textContent ?? '').toContain(
      'operation failed',
    );
  });
});
