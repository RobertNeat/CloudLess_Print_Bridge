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
import { SelectModule } from 'primeng/select';
import { I18nService } from '../../core/i18n.service';
import type { VideoPlayerData } from '../videos-dashboard.models';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;

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
  readonly starting = input(false);
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

  /**
   * start-live being "accepted" by the camera doesn't mean it has already
   * opened its own POST .../live back to the hub — there's a real window
   * where the <img> connects before frames are flowing. <img> never retries
   * a failed load on its own, so on error we re-bind [src] with a
   * cache-busting query param a few times before giving up.
   *
   * previewUrl() itself is stable across a stop -> change resolution ->
   * start cycle (same camera, same cached stream token), so Angular's [src]
   * binding sees an unchanged string on restart and never re-issues the
   * request — the <img> just keeps showing its last decoded frame. A nonce
   * appended on every active:false -> true transition forces a fresh
   * connection even when the underlying URL didn't change.
   */
  private retryCount = 0;
  private wasActive = false;
  protected readonly imageSrc = signal('');
  protected readonly previewFailed = signal(false);

  private readonly resetOnUrlChange = effect(() => {
    const url = this.previewUrl();
    const active = this.player().active;
    this.retryCount = 0;
    this.previewFailed.set(false);
    if (!active) {
      this.wasActive = false;
      return;
    }
    if (!url) return;
    const justActivated = !this.wasActive;
    this.wasActive = true;
    this.imageSrc.set(justActivated ? withCacheBust(url) : url);
  });

  protected onPreviewError(): void {
    const baseUrl = this.previewUrl();
    if (!baseUrl || this.retryCount >= MAX_RETRIES) {
      this.previewFailed.set(true);
      return;
    }
    this.retryCount += 1;
    setTimeout(() => {
      this.imageSrc.set(withCacheBust(baseUrl));
    }, RETRY_DELAY_MS);
  }

  protected onPreviewLoad(): void {
    this.retryCount = 0;
    this.previewFailed.set(false);
  }
}

function withCacheBust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}_r=${Date.now()}`;
}
