import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { I18nService, type TranslationKey } from '../../core/i18n.service';
import type { MediaRecordAction } from '../media-record-dialog/media-record-dialog.models';
import type { MediaItem, MediaKind } from '../videos-dashboard.models';

interface MediaSectionDefinition {
  readonly kind: MediaKind;
  readonly labelKey: TranslationKey;
  readonly icon: string;
  readonly action: MediaRecordAction;
  readonly buttonId: string;
  readonly buttonIcon: string;
  readonly buttonLabelKey: TranslationKey;
}

@Component({
  selector: 'app-media-library',
  imports: [ButtonModule],
  templateUrl: './media-library.html',
  styleUrl: './media-library.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaLibrary {
  protected readonly i18n = inject(I18nService);
  readonly items = input.required<readonly MediaItem[]>();
  readonly canRecord = input(false);
  readonly pendingActions = input<ReadonlySet<MediaRecordAction>>(new Set());
  readonly itemOpened = output<MediaItem>();
  readonly recordRequested = output<MediaRecordAction>();

  protected readonly sections: readonly MediaSectionDefinition[] = [
    {
      kind: 'audio',
      labelKey: 'videos.media.audio',
      icon: 'pi pi-volume-up',
      action: 'audio',
      buttonId: 'media-audio-toggle',
      buttonIcon: 'pi pi-microphone',
      buttonLabelKey: 'videos.record.recordAudio',
    },
    {
      kind: 'recording',
      labelKey: 'videos.media.recordings',
      icon: 'pi pi-video',
      action: 'recording',
      buttonId: 'media-recording-toggle',
      buttonIcon: 'pi pi-video',
      buttonLabelKey: 'videos.record.startRecording',
    },
    {
      kind: 'timelapse',
      labelKey: 'videos.media.timelapses',
      icon: 'pi pi-clock',
      action: 'timelapse',
      buttonId: 'media-timelapse-toggle',
      buttonIcon: 'pi pi-clock',
      buttonLabelKey: 'videos.record.startTimelapse',
    },
    {
      kind: 'image',
      labelKey: 'videos.media.images',
      icon: 'pi pi-images',
      action: 'capture',
      buttonId: 'media-capture-button',
      buttonIcon: 'pi pi-camera',
      buttonLabelKey: 'videos.record.capture',
    },
  ];

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

  protected isPending(action: MediaRecordAction): boolean {
    return this.pendingActions().has(action);
  }

  protected dateLabel(value: string): string {
    return this.i18n.formatShortDate(value);
  }

  protected itemLabel(item: MediaItem): string {
    return item.displayName || item.name;
  }

  protected requestRecord(action: MediaRecordAction): void {
    if (!this.canRecord() || this.isPending(action)) return;
    this.recordRequested.emit(action);
  }
}
