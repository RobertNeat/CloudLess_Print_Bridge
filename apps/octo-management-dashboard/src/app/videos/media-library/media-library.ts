import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { I18nService, type TranslationKey } from '../../core/i18n.service';
import type { MediaItem, MediaKind } from '../videos-dashboard.models';

interface MediaSectionDefinition {
  readonly kind: MediaKind;
  readonly labelKey: TranslationKey;
  readonly icon: string;
}

export type TimelapseRequest = {
  readonly resolution: string;
  readonly intervalMs: number;
  readonly durationMs: number;
};

export type RecordingRequest = {
  readonly resolution: string;
  readonly durationMs: number;
};

const DEFAULT_TIMELAPSE_INTERVAL_SECONDS = 5;
const DEFAULT_TIMELAPSE_DURATION_SECONDS = 60;
const DEFAULT_RECORDING_DURATION_SECONDS = 30;
const DEFAULT_AUDIO_DURATION_SECONDS = 5;
const MIN_AUDIO_DURATION_SECONDS = 1;
const MAX_AUDIO_DURATION_SECONDS = 20;

@Component({
  selector: 'app-media-library',
  imports: [ButtonModule, FormsModule, InputTextModule, SelectModule],
  templateUrl: './media-library.html',
  styleUrl: './media-library.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaLibrary {
  protected readonly i18n = inject(I18nService);
  readonly items = input.required<readonly MediaItem[]>();
  readonly canRecord = input(false);
  readonly availableResolutions = input<readonly string[]>([]);
  readonly itemOpened = output<MediaItem>();
  readonly captureRequested = output<string>();
  readonly startTimelapseRequested = output<TimelapseRequest>();
  readonly startRecordingRequested = output<RecordingRequest>();
  readonly recordAudioRequested = output<number>();

  protected readonly sections: readonly MediaSectionDefinition[] = [
    { kind: 'audio', labelKey: 'videos.media.audio', icon: 'pi pi-volume-up' },
    { kind: 'recording', labelKey: 'videos.media.recordings', icon: 'pi pi-video' },
    { kind: 'timelapse', labelKey: 'videos.media.timelapses', icon: 'pi pi-clock' },
    { kind: 'image', labelKey: 'videos.media.images', icon: 'pi pi-images' },
  ];

  protected readonly captureResolution = signal('');
  protected readonly timelapseIntervalSeconds = signal(DEFAULT_TIMELAPSE_INTERVAL_SECONDS);
  protected readonly timelapseDurationSeconds = signal(DEFAULT_TIMELAPSE_DURATION_SECONDS);
  protected readonly recordingDurationSeconds = signal(DEFAULT_RECORDING_DURATION_SECONDS);
  protected readonly audioDurationSeconds = signal(DEFAULT_AUDIO_DURATION_SECONDS);
  protected readonly timelapseFormOpen = signal(false);
  protected readonly recordingFormOpen = signal(false);
  protected readonly audioFormOpen = signal(false);

  protected readonly resolution = computed(
    () => this.captureResolution() || this.availableResolutions()[0] || 'VGA',
  );

  private readonly itemsByKind = computed(() => {
    const grouped: Record<MediaKind, MediaItem[]> = {
      audio: [],
      recording: [],
      timelapse: [],
      image: [],
    };
    for (const item of this.items()) {
      const kind = item.kind === 'image' && (item.frameCount ?? 0) > 1 ? 'timelapse' : item.kind;
      grouped[kind].push(item);
    }
    return grouped;
  });

  protected itemsFor(kind: MediaKind): readonly MediaItem[] {
    return this.itemsByKind()[kind];
  }

  protected dateLabel(value: string): string {
    return this.i18n.formatShortDate(value);
  }

  protected itemLabel(item: MediaItem): string {
    return item.displayName || item.name;
  }

  protected capture(): void {
    if (!this.canRecord()) return;
    this.captureRequested.emit(this.resolution());
  }

  protected toggleTimelapseForm(): void {
    this.timelapseFormOpen.update((open) => !open);
  }

  protected startTimelapse(): void {
    if (!this.canRecord()) return;
    this.startTimelapseRequested.emit({
      resolution: this.resolution(),
      intervalMs: Math.max(250, this.timelapseIntervalSeconds() * 1000),
      durationMs: Math.max(1000, this.timelapseDurationSeconds() * 1000),
    });
    this.timelapseFormOpen.set(false);
  }

  protected toggleRecordingForm(): void {
    this.recordingFormOpen.update((open) => !open);
  }

  protected startRecording(): void {
    if (!this.canRecord()) return;
    this.startRecordingRequested.emit({
      resolution: this.resolution(),
      durationMs: Math.max(1000, this.recordingDurationSeconds() * 1000),
    });
    this.recordingFormOpen.set(false);
  }

  protected toggleAudioForm(): void {
    this.audioFormOpen.update((open) => !open);
  }

  protected recordAudio(): void {
    if (!this.canRecord()) return;
    const clamped = Math.min(
      MAX_AUDIO_DURATION_SECONDS,
      Math.max(MIN_AUDIO_DURATION_SECONDS, this.audioDurationSeconds()),
    );
    this.recordAudioRequested.emit(clamped);
    this.audioFormOpen.set(false);
  }
}
