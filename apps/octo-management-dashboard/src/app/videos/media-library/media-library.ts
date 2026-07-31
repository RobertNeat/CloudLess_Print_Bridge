import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import type { MediaItem, MediaKind } from '../videos-dashboard.models';

interface MediaSectionDefinition {
  readonly kind: MediaKind;
  readonly label: string;
  readonly icon: string;
}

@Component({
  selector: 'app-media-library',
  imports: [ButtonModule],
  templateUrl: './media-library.html',
  styleUrl: './media-library.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaLibrary {
  readonly items = input.required<readonly MediaItem[]>();
  readonly itemOpened = output<MediaItem>();

  protected readonly sections: readonly MediaSectionDefinition[] = [
    { kind: 'audio', label: 'Audio', icon: 'pi pi-volume-up' },
    { kind: 'recording', label: 'Nagrania', icon: 'pi pi-video' },
    { kind: 'timelapse', label: 'Timelapse', icon: 'pi pi-clock' },
    { kind: 'image', label: 'Zdjęcia', icon: 'pi pi-images' },
  ];

  protected itemsFor(kind: MediaKind): readonly MediaItem[] {
    return this.items().filter((item) => item.kind === kind);
  }

  protected dateLabel(value: string): string {
    return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: 'short' }).format(new Date(value));
  }
}
