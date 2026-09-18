import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/i18n.service';
import { MediaLibraryApiService } from '../backend/media-library-api.service';
import { MediaTokenApiService } from '../backend/media-token-api.service';
import type { MediaItem } from '../videos-dashboard.models';
import { MediaPreview } from './media-preview';

const recording: MediaItem = {
  id: 'recording:camera-1:req-1',
  kind: 'recording',
  name: 'req-1.mjpeg',
  sourceId: 'camera-1',
  requestId: 'req-1',
  capturedAt: '2026-08-03T10:00:00Z',
  downloadUrl: 'http://hub/api/v1/recordings/camera-1/req-1/file',
  transcodeUrl: 'http://hub/api/v1/recordings/camera-1/req-1/transcode',
  mp4Url: 'http://hub/api/v1/recordings/camera-1/req-1/mp4',
};

const timelapse: MediaItem = {
  id: 'timelapse:camera-1:tl-1',
  kind: 'timelapse',
  name: '000000.jpg',
  sourceId: 'camera-1',
  requestId: 'tl-1',
  capturedAt: '2026-08-03T10:00:00Z',
  downloadUrl: 'http://hub/api/v1/captures/camera-1/tl-1/file?fileName=000001.jpg',
  transcodeUrl: 'http://hub/api/v1/captures/camera-1/tl-1/transcode',
  mp4Url: 'http://hub/api/v1/captures/camera-1/tl-1/mp4',
};

describe('MediaPreview mp4 playback', () => {
  let transcode: ReturnType<typeof vi.fn>;
  let acquire: ReturnType<typeof vi.fn>;
  let deleteMedia: ReturnType<typeof vi.fn>;
  let listCaptureFrames: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    transcode = vi.fn().mockResolvedValue(undefined);
    acquire = vi.fn().mockResolvedValue('tok-123');
    deleteMedia = vi.fn().mockResolvedValue(undefined);
    listCaptureFrames = vi.fn().mockResolvedValue([]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MediaLibraryApiService,
          useValue: { transcode, listCaptureFrames, delete: deleteMedia },
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

  it('triggers transcode then acquires a recording-mp4 token and sets a tokened mp4 src', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', recording);
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();

    expect(transcode).toHaveBeenCalledWith(recording.transcodeUrl);
    expect(acquire).toHaveBeenCalledWith({
      kind: 'recording-mp4',
      cameraId: 'camera-1',
      requestId: 'req-1',
    });
    expect((fixture.componentInstance as unknown as { mp4Src: () => string }).mp4Src()).toBe(
      `${recording.mp4Url}?mediaToken=tok-123`,
    );
  });

  it('triggers transcode then acquires a capture-mp4 token for a timelapse with transcodeUrl/mp4Url', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', timelapse);
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();

    expect(transcode).toHaveBeenCalledWith(timelapse.transcodeUrl);
    expect(acquire).toHaveBeenCalledWith({
      kind: 'capture-mp4',
      cameraId: 'camera-1',
      requestId: 'tl-1',
    });
    expect((fixture.componentInstance as unknown as { mp4Src: () => string }).mp4Src()).toBe(
      `${timelapse.mp4Url}?mediaToken=tok-123`,
    );
  });

  it('falls back to the frame slider for a timelapse with no transcodeUrl/mp4Url', async () => {
    const legacyTimelapse: MediaItem = { ...timelapse, transcodeUrl: undefined, mp4Url: undefined };
    listCaptureFrames.mockResolvedValue([{ fileName: '000000.jpg', sequence: 0 }]);

    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', legacyTimelapse);
    fixture.detectChanges();
    await fixture.whenStable();
    // showFrame's token acquisition is one more microtask beyond
    // loadTimelapseFrames' own await, so whenStable alone can observe
    // frames already populated but loading() not yet flipped back to false.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(transcode).not.toHaveBeenCalled();
    expect(listCaptureFrames).toHaveBeenCalledWith('camera-1', 'tl-1');
    expect(
      fixture.nativeElement.querySelector('#media-preview-frame-slider'),
    ).not.toBeNull();
  });

  it('retries a failing transcode call before giving up', async () => {
    vi.useFakeTimers();
    try {
      transcode.mockRejectedValueOnce(new Error('network error'));
      transcode.mockRejectedValueOnce(new Error('network error'));
      transcode.mockResolvedValueOnce(undefined);

      const fixture = TestBed.createComponent(MediaPreview);
      fixture.componentRef.setInput('item', recording);
      fixture.detectChanges();

      // Let the first (failing) attempt's microtasks settle, then advance
      // past its retry delay; repeat for the second failing attempt.
      await vi.advanceTimersByTimeAsync(1500);
      await vi.advanceTimersByTimeAsync(1500);
      await vi.runAllTimersAsync();

      expect(transcode).toHaveBeenCalledTimes(3);
      expect(acquire).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a transcode failure after exhausting retries, without acquiring a token', async () => {
    vi.useFakeTimers();
    try {
      transcode.mockRejectedValue(new Error('still failing'));

      const fixture = TestBed.createComponent(MediaPreview);
      fixture.componentRef.setInput('item', recording);
      fixture.detectChanges();

      await vi.runAllTimersAsync();

      // MAX_TRANSCODE_RETRIES = 3 retries after the first attempt => 4 calls total.
      expect(transcode).toHaveBeenCalledTimes(4);
      expect(acquire).not.toHaveBeenCalled();
      expect(
        (fixture.componentInstance as unknown as { mp4TranscodeFailed: () => boolean })
          .mp4TranscodeFailed(),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-acquires a token on a player playback error instead of retrying the transcode', async () => {
    const fixture = TestBed.createComponent(MediaPreview);
    fixture.componentRef.setInput('item', recording);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(transcode).toHaveBeenCalledTimes(1);

    acquire.mockResolvedValueOnce('tok-456');
    (fixture.componentInstance as unknown as { onMp4PlaybackError: () => void }).onMp4PlaybackError();
    await fixture.whenStable();

    // A playback error re-acquires a token (the failure is assumed to be a
    // stale/expired token or transient stream hiccup), not a re-transcode.
    expect(transcode).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledTimes(2);
    expect((fixture.componentInstance as unknown as { mp4Src: () => string }).mp4Src()).toBe(
      `${recording.mp4Url}?mediaToken=tok-456`,
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
      transcodeUrl: 'http://hub/api/v1/recordings/camera-1/req-2/transcode',
      mp4Url: 'http://hub/api/v1/recordings/camera-1/req-2/mp4',
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
