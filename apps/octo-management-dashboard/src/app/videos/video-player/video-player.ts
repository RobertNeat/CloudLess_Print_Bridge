import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import type { VideoPlayerData } from '../videos-dashboard.models';

@Component({
  selector: 'app-video-player',
  imports: [ButtonModule, FormsModule, SelectModule],
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayer {
  readonly player = input.required<VideoPlayerData>();
  readonly activeChanged = output<boolean>();
  readonly resolutionChanged = output<string>();
}
