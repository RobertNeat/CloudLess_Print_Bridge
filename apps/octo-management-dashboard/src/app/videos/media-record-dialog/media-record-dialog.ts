import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { I18nService, type TranslationKey } from '../../core/i18n.service';
import type {
  MediaRecordAction,
  MediaRecordRequest,
  MediaRecordSourceOption,
} from './media-record-dialog.models';

const DIALOG_TITLE_KEY: Record<MediaRecordAction, TranslationKey> = {
  audio: 'videos.record.dialogTitle.audio',
  recording: 'videos.record.dialogTitle.recording',
  timelapse: 'videos.record.dialogTitle.timelapse',
  capture: 'videos.record.dialogTitle.capture',
};

const DEFAULT_TIMELAPSE_INTERVAL_SECONDS = 5;
const DEFAULT_TIMELAPSE_DURATION_SECONDS = 60;
const DEFAULT_RECORDING_DURATION_SECONDS = 30;
const DEFAULT_AUDIO_DURATION_SECONDS = 5;
const MIN_AUDIO_DURATION_SECONDS = 1;
const MAX_AUDIO_DURATION_SECONDS = 20;
const AVAILABLE_RESOLUTIONS = ['QVGA', 'VGA', 'SVGA', 'XGA', 'UXGA'] as const;

/**
 * Reusable parameter popup for the 4 media-registering actions (capture,
 * recording, timelapse, audio). One component instance is mounted at the
 * dashboard-page level and reconfigures its fields per `action` input,
 * rather than the media-library grid owning 4 separate inline forms — the
 * grid now only emits *which* action was requested, and this dialog owns
 * the source/resolution/duration/interval parameters (including
 * media-capture-resolution, migrated here from the grid's own toolbar).
 */
@Component({
  selector: 'app-media-record-dialog',
  imports: [ButtonModule, DialogModule, FormsModule, InputNumberModule, SelectModule],
  templateUrl: './media-record-dialog.html',
  styleUrl: './media-record-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaRecordDialog {
  protected readonly i18n = inject(I18nService);

  readonly action = input<MediaRecordAction | null>(null);
  readonly sources = input<readonly MediaRecordSourceOption[]>([]);
  readonly defaultSourceId = input<string>('');
  readonly closed = output<void>();
  readonly submitted = output<MediaRecordRequest>();

  protected readonly availableResolutions = AVAILABLE_RESOLUTIONS;

  protected readonly sourceId = signal('');
  protected readonly resolution = signal<string>(AVAILABLE_RESOLUTIONS[1]);
  protected readonly audioDurationSeconds = signal(DEFAULT_AUDIO_DURATION_SECONDS);

  // Recording duration H/M/S triplet.
  protected readonly recordingHours = signal<number | null>(null);
  protected readonly recordingMinutes = signal<number | null>(null);
  protected readonly recordingSeconds = signal<number | null>(null);
  protected readonly recordingDurationSeconds = computed(() =>
    composeHms(this.recordingHours(), this.recordingMinutes(), this.recordingSeconds()),
  );

  // Timelapse duration H/M/S triplet.
  protected readonly timelapseDurationHours = signal<number | null>(null);
  protected readonly timelapseDurationMinutes = signal<number | null>(1);
  protected readonly timelapseDurationSeconds = signal<number | null>(null);
  protected readonly timelapseDurationTotalSeconds = computed(() =>
    composeHms(
      this.timelapseDurationHours(),
      this.timelapseDurationMinutes(),
      this.timelapseDurationSeconds(),
    ),
  );

  // Timelapse interval H/M/S triplet.
  protected readonly timelapseIntervalHours = signal<number | null>(null);
  protected readonly timelapseIntervalMinutes = signal<number | null>(null);
  protected readonly timelapseIntervalSeconds = signal<number | null>(
    DEFAULT_TIMELAPSE_INTERVAL_SECONDS,
  );
  protected readonly timelapseIntervalTotalSeconds = computed(() =>
    composeHms(
      this.timelapseIntervalHours(),
      this.timelapseIntervalMinutes(),
      this.timelapseIntervalSeconds(),
    ),
  );

  protected readonly minAudioDuration = MIN_AUDIO_DURATION_SECONDS;
  protected readonly maxAudioDuration = MAX_AUDIO_DURATION_SECONDS;

  protected readonly needsResolution = computed(() => this.action() !== 'audio');

  protected readonly selectedSource = computed(() =>
    this.sources().find((source) => source.id === this.sourceId()),
  );

  protected readonly sourceCommandable = computed(() => !!this.selectedSource()?.commandable);

  protected readonly durationValid = computed(() => {
    switch (this.action()) {
      case 'recording':
        return this.recordingDurationSeconds() > 0;
      case 'timelapse':
        return this.timelapseDurationTotalSeconds() > 0 && this.timelapseIntervalTotalSeconds() > 0;
      default:
        return true;
    }
  });

  protected readonly canSubmit = computed(() => this.sourceCommandable() && this.durationValid());

  protected readonly dialogTitleKey = computed<TranslationKey>(
    () => DIALOG_TITLE_KEY[this.action() ?? 'capture'],
  );

  private readonly resetOnOpen = effect(() => {
    const action = this.action();
    if (!action) return;
    this.sourceId.set(this.defaultSourceId());
    this.resolution.set(AVAILABLE_RESOLUTIONS[1]);

    const [recordingHours, recordingMinutes, recordingSeconds] = splitHms(
      DEFAULT_RECORDING_DURATION_SECONDS,
    );
    this.recordingHours.set(recordingHours);
    this.recordingMinutes.set(recordingMinutes);
    this.recordingSeconds.set(recordingSeconds);

    const [timelapseDurationHours, timelapseDurationMinutes, timelapseDurationSeconds] = splitHms(
      DEFAULT_TIMELAPSE_DURATION_SECONDS,
    );
    this.timelapseDurationHours.set(timelapseDurationHours);
    this.timelapseDurationMinutes.set(timelapseDurationMinutes);
    this.timelapseDurationSeconds.set(timelapseDurationSeconds);

    const [timelapseIntervalHours, timelapseIntervalMinutes, timelapseIntervalSeconds] = splitHms(
      DEFAULT_TIMELAPSE_INTERVAL_SECONDS,
    );
    this.timelapseIntervalHours.set(timelapseIntervalHours);
    this.timelapseIntervalMinutes.set(timelapseIntervalMinutes);
    this.timelapseIntervalSeconds.set(timelapseIntervalSeconds);

    this.audioDurationSeconds.set(DEFAULT_AUDIO_DURATION_SECONDS);
  });

  protected close(): void {
    this.closed.emit();
  }

  protected submit(): void {
    const action = this.action();
    const source = this.selectedSource();
    if (!action || !source?.commandable) return;

    switch (action) {
      case 'audio':
        this.submitted.emit({
          action: 'audio',
          sourceId: source.id,
          durationSeconds: clamp(
            this.audioDurationSeconds(),
            MIN_AUDIO_DURATION_SECONDS,
            MAX_AUDIO_DURATION_SECONDS,
          ),
        });
        break;
      case 'recording': {
        const durationSeconds = this.recordingDurationSeconds();
        if (durationSeconds <= 0) return;
        this.submitted.emit({
          action: 'recording',
          sourceId: source.id,
          resolution: this.resolution(),
          durationSeconds,
        });
        break;
      }
      case 'timelapse': {
        const durationSeconds = this.timelapseDurationTotalSeconds();
        const intervalSeconds = this.timelapseIntervalTotalSeconds();
        if (durationSeconds <= 0 || intervalSeconds <= 0) return;
        this.submitted.emit({
          action: 'timelapse',
          sourceId: source.id,
          resolution: this.resolution(),
          durationSeconds,
          intervalSeconds,
        });
        break;
      }
      case 'capture':
        this.submitted.emit({
          action: 'capture',
          sourceId: source.id,
          resolution: this.resolution(),
        });
        break;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Composes an H/M/S triplet into total seconds, treating null/undefined sub-fields as 0. */
function composeHms(
  hours: number | null | undefined,
  minutes: number | null | undefined,
  seconds: number | null | undefined,
): number {
  return (
    Math.max(0, hours ?? 0) * 3600 + Math.max(0, minutes ?? 0) * 60 + Math.max(0, seconds ?? 0)
  );
}

/** Splits total seconds into an H/M/S triplet, using null for zero units so placeholders show. */
function splitHms(totalSeconds: number): [number | null, number | null, number | null] {
  const safeTotal = Math.max(0, Math.trunc(totalSeconds));
  const hours = Math.floor(safeTotal / 3600);
  const minutes = Math.floor((safeTotal % 3600) / 60);
  const seconds = safeTotal % 60;
  return [hours || null, minutes || null, seconds || null];
}
