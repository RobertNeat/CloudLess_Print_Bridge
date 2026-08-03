import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18nService, type TranslationKey } from '../../core/i18n.service';
import type { MediaItem, MediaKind } from '../videos-dashboard.models';

interface MediaSectionDefinition {
  readonly kind: MediaKind;
  readonly labelKey: TranslationKey;
  readonly icon: string;
}

@Component({
  selector: 'app-media-library',
  templateUrl: './media-library.html',
  styleUrl: './media-library.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaLibrary {
  protected readonly i18n = inject(I18nService);
  readonly items = input.required<readonly MediaItem[]>();
  readonly itemOpened = output<MediaItem>();

  protected readonly sections: readonly MediaSectionDefinition[] = [
    { kind: 'audio', labelKey: 'videos.media.audio', icon: 'pi pi-volume-up' },
    { kind: 'recording', labelKey: 'videos.media.recordings', icon: 'pi pi-video' },
    { kind: 'timelapse', labelKey: 'videos.media.timelapses', icon: 'pi pi-clock' },
    { kind: 'image', labelKey: 'videos.media.images', icon: 'pi pi-images' },
  ];

  private readonly itemsByKind = computed(() => {
    const grouped: Record<MediaKind, MediaItem[]> = {
      audio: [],
      recording: [],
      timelapse: [],
      image: [],
    };
    for (const item of this.items()) grouped[item.kind].push(item);
    return grouped;
  });

  protected itemsFor(kind: MediaKind): readonly MediaItem[] {
    return this.itemsByKind()[kind];
  }

  protected dateLabel(value: string): string {
    return this.i18n.formatShortDate(value);
  }
}
