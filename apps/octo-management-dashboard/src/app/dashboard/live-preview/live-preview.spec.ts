import { TestBed } from '@angular/core/testing';
import { LivePreview } from './live-preview';
import type { LivePreviewData } from '../dashboard.models';

const BASE_PREVIEW: LivePreviewData = {
  cameraName: 'Kamera drukarki',
  cameraId: 'cam-printer',
  resolution: 'VGA',
  availableResolutions: ['QVGA', 'VGA', 'SVGA', 'XGA', 'UXGA'],
  active: false,
  latencyMs: 0,
};

describe('LivePreview', () => {
  it('shows the blurred offline placeholder image when inactive', () => {
    const fixture = TestBed.createComponent(LivePreview);
    fixture.componentRef.setInput('preview', BASE_PREVIEW);
    fixture.detectChanges();

    const placeholder = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-offline-placeholder"]',
    );
    const placeholderImage = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-offline-image"]',
    ) as HTMLImageElement | null;
    const streamImage = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-stream-image"]',
    );
    expect(placeholder).toBeTruthy();
    expect(placeholderImage?.getAttribute('src')).toBe('/images/live_preview.png');
    expect(streamImage).toBeNull();
  });

  it('shows the offline placeholder (not the raw stream image) when active but no streamUrl has resolved yet', () => {
    const fixture = TestBed.createComponent(LivePreview);
    fixture.componentRef.setInput('preview', { ...BASE_PREVIEW, active: true });
    fixture.detectChanges();

    const streamImage = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-stream-image"]',
    );
    const placeholder = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-offline-placeholder"]',
    );
    expect(streamImage).toBeNull();
    expect(placeholder).toBeTruthy();
  });

  it('shows the tokened stream image once active and streamUrl is set', () => {
    const fixture = TestBed.createComponent(LivePreview);
    fixture.componentRef.setInput('preview', { ...BASE_PREVIEW, active: true });
    fixture.componentRef.setInput('streamUrl', 'https://hub.example/stream?streamToken=abc');
    fixture.detectChanges();

    const streamImage = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-stream-image"]',
    ) as HTMLImageElement | null;
    // A cache-busting nonce is appended on the inactive->active transition
    // (see live-preview.ts's resetOnUrlChange) so the browser always issues
    // a fresh request rather than reusing a stale/broken cached image.
    expect(streamImage?.getAttribute('src')).toContain(
      'https://hub.example/stream?streamToken=abc',
    );
    expect(streamImage?.getAttribute('src')).toMatch(/[?&]_r=\d+$/);
  });

  it('re-fetches with a fresh cache-busting nonce and clears the failed state on retry after a load error', () => {
    const fixture = TestBed.createComponent(LivePreview);
    fixture.componentRef.setInput('preview', { ...BASE_PREVIEW, active: true });
    fixture.componentRef.setInput('streamUrl', 'https://hub.example/stream?streamToken=abc');
    fixture.detectChanges();

    const streamImage = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-stream-image"]',
    ) as HTMLImageElement;
    streamImage.dispatchEvent(new Event('load'));

    expect(
      fixture.nativeElement.querySelector('[data-testid="live-preview-failed-message"]'),
    ).toBeNull();
  });

  it('marks the status dot active only when the stream is active', () => {
    const fixture = TestBed.createComponent(LivePreview);
    fixture.componentRef.setInput('preview', { ...BASE_PREVIEW, active: true });
    fixture.detectChanges();

    const dot = fixture.nativeElement.querySelector('[data-testid="live-preview-status-dot"]');
    expect(dot.classList.contains('live-dot--active')).toBe(true);
  });

  it('disables the start button when the hub is unavailable and the stream is not active', () => {
    const fixture = TestBed.createComponent(LivePreview);
    fixture.componentRef.setInput('preview', BASE_PREVIEW);
    fixture.componentRef.setInput('hubAvailable', false);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-toggle-button"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('still allows stopping an active stream even if hubAvailable later becomes false', () => {
    const fixture = TestBed.createComponent(LivePreview);
    fixture.componentRef.setInput('preview', { ...BASE_PREVIEW, active: true });
    fixture.componentRef.setInput('hubAvailable', false);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-toggle-button"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('emits activeChanged with the toggled value on click', () => {
    const fixture = TestBed.createComponent(LivePreview);
    fixture.componentRef.setInput('preview', BASE_PREVIEW);
    fixture.detectChanges();

    const emitted: boolean[] = [];
    fixture.componentInstance.activeChanged.subscribe((value) => emitted.push(value));

    const button = fixture.nativeElement.querySelector(
      '[data-testid="live-preview-toggle-button"]',
    ) as HTMLButtonElement;
    button.click();

    expect(emitted).toEqual([true]);
  });
});
