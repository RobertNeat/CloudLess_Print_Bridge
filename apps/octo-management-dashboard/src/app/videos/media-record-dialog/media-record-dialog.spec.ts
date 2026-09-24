import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/i18n.service';
import { MediaRecordDialog } from './media-record-dialog';
import type { MediaRecordSourceOption } from './media-record-dialog.models';

const sources: MediaRecordSourceOption[] = [
  { id: 'cam-online', name: 'Front', commandable: true },
  { id: 'cam-offline', name: 'Back', commandable: false },
];

describe('MediaRecordDialog', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(I18nService).language.set('en');
  });

  it('is hidden when action is null and shows the right title once opened', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('action', null);
    fixture.detectChanges();
    await fixture.whenStable();

    let element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.media-record-dialog__form')).toBeNull();

    fixture.componentRef.setInput('action', 'timelapse');
    fixture.componentRef.setInput('sources', sources);
    fixture.detectChanges();
    await fixture.whenStable();

    element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Start timelapse');
    expect(element.querySelector('#media-record-dialog-timelapse-interval')).not.toBeNull();
    expect(element.querySelector('#media-record-dialog-timelapse-duration')).not.toBeNull();
    expect(element.querySelector('#media-record-dialog-resolution')).not.toBeNull();
  });

  it('shows only source + duration fields for audio (no resolution)', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('action', 'audio');
    fixture.componentRef.setInput('sources', sources);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#media-record-dialog-resolution')).toBeNull();
    expect(element.querySelector('#media-record-dialog-audio-duration')).not.toBeNull();
  });

  it('defaults the source select to defaultSourceId on open', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('defaultSourceId', 'cam-offline');
    fixture.componentRef.setInput('action', 'capture');
    fixture.detectChanges();
    await fixture.whenStable();

    const instance = fixture.componentInstance as unknown as { sourceId: () => string };
    expect(instance.sourceId()).toBe('cam-offline');
  });

  it('disables submit and shows a hint when the selected source is not commandable', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('defaultSourceId', 'cam-offline');
    fixture.componentRef.setInput('action', 'capture');
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#media-record-dialog-hint')).not.toBeNull();
    const submitButton = element.querySelector(
      '#media-record-dialog-submit button',
    ) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  it('composes default H/M/S values into recording and timelapse totals on submit', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('defaultSourceId', 'cam-online');
    fixture.componentRef.setInput('action', 'recording');
    fixture.detectChanges();
    await fixture.whenStable();

    const submittedSpy = vi.fn();
    fixture.componentInstance.submitted.subscribe(submittedSpy);
    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#media-record-dialog-submit button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(submittedSpy).toHaveBeenCalledWith({
      action: 'recording',
      sourceId: 'cam-online',
      resolution: 'VGA',
      durationSeconds: 30,
    });
  });

  it('composes hours/minutes/seconds into total seconds for the recording duration', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('defaultSourceId', 'cam-online');
    fixture.componentRef.setInput('action', 'recording');
    fixture.detectChanges();
    await fixture.whenStable();

    const instance = fixture.componentInstance as unknown as {
      recordingHours: { set: (value: number | null) => void };
      recordingMinutes: { set: (value: number | null) => void };
      recordingSeconds: { set: (value: number | null) => void };
    };
    instance.recordingHours.set(1);
    instance.recordingMinutes.set(2);
    instance.recordingSeconds.set(3);

    const submittedSpy = vi.fn();
    fixture.componentInstance.submitted.subscribe(submittedSpy);
    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#media-record-dialog-submit button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(submittedSpy).toHaveBeenCalledWith({
      action: 'recording',
      sourceId: 'cam-online',
      resolution: 'VGA',
      durationSeconds: 3723,
    });
  });

  it('treats blank (null) H/M/S sub-fields as 0 when composing the total', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('defaultSourceId', 'cam-online');
    fixture.componentRef.setInput('action', 'recording');
    fixture.detectChanges();
    await fixture.whenStable();

    const instance = fixture.componentInstance as unknown as {
      recordingHours: { set: (value: number | null) => void };
      recordingMinutes: { set: (value: number | null) => void };
      recordingSeconds: { set: (value: number | null) => void };
    };
    instance.recordingHours.set(null);
    instance.recordingMinutes.set(null);
    instance.recordingSeconds.set(45);

    const submittedSpy = vi.fn();
    fixture.componentInstance.submitted.subscribe(submittedSpy);
    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#media-record-dialog-submit button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(submittedSpy).toHaveBeenCalledWith({
      action: 'recording',
      sourceId: 'cam-online',
      resolution: 'VGA',
      durationSeconds: 45,
    });
  });

  it('composes timelapse duration and interval independently', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('defaultSourceId', 'cam-online');
    fixture.componentRef.setInput('action', 'timelapse');
    fixture.detectChanges();
    await fixture.whenStable();

    const submittedSpy = vi.fn();
    fixture.componentInstance.submitted.subscribe(submittedSpy);
    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#media-record-dialog-submit button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(submittedSpy).toHaveBeenCalledWith({
      action: 'timelapse',
      sourceId: 'cam-online',
      resolution: 'VGA',
      durationSeconds: 60,
      intervalSeconds: 5,
    });
  });

  it('disables submit and shows a hint when the composed duration is 0, without an offline-camera hint', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('defaultSourceId', 'cam-online');
    fixture.componentRef.setInput('action', 'recording');
    fixture.detectChanges();
    await fixture.whenStable();

    const instance = fixture.componentInstance as unknown as {
      recordingHours: { set: (value: number | null) => void };
      recordingMinutes: { set: (value: number | null) => void };
      recordingSeconds: { set: (value: number | null) => void };
    };
    instance.recordingHours.set(null);
    instance.recordingMinutes.set(null);
    instance.recordingSeconds.set(null);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#media-record-dialog-zero-duration-hint')).not.toBeNull();
    expect(element.querySelector('#media-record-dialog-hint')).toBeNull();
    const submitButton = element.querySelector(
      '#media-record-dialog-submit button',
    ) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    const submittedSpy = vi.fn();
    fixture.componentInstance.submitted.subscribe(submittedSpy);
    submitButton.click();
    fixture.detectChanges();
    expect(submittedSpy).not.toHaveBeenCalled();
  });

  it('emits a capture request with the chosen source and resolution', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('defaultSourceId', 'cam-online');
    fixture.componentRef.setInput('action', 'capture');
    fixture.detectChanges();
    await fixture.whenStable();

    const submittedSpy = vi.fn();
    fixture.componentInstance.submitted.subscribe(submittedSpy);

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#media-record-dialog-submit button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(submittedSpy).toHaveBeenCalledWith({
      action: 'capture',
      sourceId: 'cam-online',
      resolution: 'VGA',
    });
  });

  it('clamps audio duration into the 1-20s range on submit', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('defaultSourceId', 'cam-online');
    fixture.componentRef.setInput('action', 'audio');
    fixture.detectChanges();
    await fixture.whenStable();

    const instance = fixture.componentInstance as unknown as {
      audioDurationSeconds: { set: (value: number) => void };
    };
    instance.audioDurationSeconds.set(999);

    const submittedSpy = vi.fn();
    fixture.componentInstance.submitted.subscribe(submittedSpy);
    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('#media-record-dialog-submit button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(submittedSpy).toHaveBeenCalledWith({
      action: 'audio',
      sourceId: 'cam-online',
      durationSeconds: 20,
    });
  });

  it('emits closed when the cancel button is clicked', async () => {
    const fixture = TestBed.createComponent(MediaRecordDialog);
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('action', 'capture');
    fixture.detectChanges();
    await fixture.whenStable();

    const closedSpy = vi.fn();
    fixture.componentInstance.closed.subscribe(closedSpy);
    const element = fixture.nativeElement as HTMLElement;
    const cancelButton = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.media-record-dialog__actions button'),
    ).find((button) => button.textContent?.includes('Cancel'));
    cancelButton?.click();
    fixture.detectChanges();

    expect(closedSpy).toHaveBeenCalledTimes(1);
  });
});
