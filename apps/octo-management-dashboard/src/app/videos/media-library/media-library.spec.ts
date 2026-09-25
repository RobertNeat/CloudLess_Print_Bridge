import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/i18n.service';
import { MediaLibrary } from './media-library';

describe('MediaLibrary', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(I18nService).language.set('en');
  });

  it('never disables or spins the record buttons while canRecord is true, so the same action can be retriggered immediately', async () => {
    const fixture = TestBed.createComponent(MediaLibrary);
    fixture.componentRef.setInput('items', []);
    fixture.componentRef.setInput('canRecord', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const captureButton = element.querySelector(
      '#media-capture-button button',
    ) as HTMLButtonElement;
    expect(captureButton.disabled).toBe(false);
    expect(captureButton.className).not.toContain('p-button-loading');

    const recordSpy = vi.fn();
    fixture.componentInstance.recordRequested.subscribe(recordSpy);
    captureButton.click();
    captureButton.click();

    // No client-side pending lock: both clicks emit.
    expect(recordSpy).toHaveBeenCalledTimes(2);
  });

  it('disables the record buttons when canRecord is false', async () => {
    const fixture = TestBed.createComponent(MediaLibrary);
    fixture.componentRef.setInput('items', []);
    fixture.componentRef.setInput('canRecord', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const captureButton = element.querySelector(
      '#media-capture-button button',
    ) as HTMLButtonElement;
    expect(captureButton.disabled).toBe(true);
  });
});
