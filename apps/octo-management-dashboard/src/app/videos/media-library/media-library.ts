import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { I18nService, type TranslationKey } from '../../core/i18n.service';
import { ThemeService } from '../../core/theme.service';
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
  private readonly theme = inject(ThemeService);
  readonly items = input.required<readonly MediaItem[]>();
  readonly canRecord = input(false);
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

  /**
   * A completed live-view recording (kind: 'live') has its own URL segment,
   * token kind, and rename/delete routes on the hub, but there is no
   * separate "live recordings" section in this grid — it is grouped into
   * the same 'recording' section as a plain timed recording, matching the
   * hub's own GET /api/v1/video, which merges recordings + live into one
   * list for exactly this dashboard panel.
   */
  private sectionFor(kind: MediaKind): MediaKind {
    return kind === 'live' ? 'recording' : kind;
  }

  private readonly itemsByKind = computed(() => {
    const grouped: Record<MediaKind, MediaItem[]> = {
      audio: [],
      recording: [],
      live: [],
      timelapse: [],
      image: [],
    };
    for (const item of this.items()) {
      grouped[this.sectionFor(item.kind)].push(item);
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

  /**
   * Audio waveform thumbnails are pre-rendered in two theme-specific color
   * variants (see ThumbnailService on the backend, which bakes the gradient
   * in at generation time since it has no way to know a viewer's live theme
   * preference). Every other kind only ever has thumbnailUrl.
   */
  protected thumbnailSrc(item: MediaItem): string | undefined {
    if (item.kind !== 'audio') return item.thumbnailUrl;
    const themed = this.theme.isDark() ? item.thumbnailUrlDark : item.thumbnailUrlLight;
    return themed ?? item.thumbnailUrl;
  }

  protected requestRecord(action: MediaRecordAction): void {
    if (!this.canRecord()) return;
    this.recordRequested.emit(action);
  }
}
