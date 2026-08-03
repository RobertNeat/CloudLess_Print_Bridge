import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { I18nService } from '../../core/i18n.service';
import type { VideoPlayerData } from '../videos-dashboard.models';

@Component({
  selector: 'app-video-player',
  imports: [ButtonModule, FormsModule, SelectModule],
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayer {
  protected readonly i18n = inject(I18nService);
  readonly player = input.required<VideoPlayerData>();
  readonly canStart = input.required<boolean>();
  readonly sourceName = input.required<string>();
  readonly previewUrl = input.required<string>();
  readonly activeChanged = output<boolean>();
  readonly resolutionChanged = output<string>();

  protected readonly resolutionOptions = computed(() =>
    this.player().availableResolutions.map((value) => ({
      value,
      label: value === 'auto' ? this.i18n.t('videos.resolution.auto') : value,
    })),
  );
}
