import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import type { LivePreviewData } from '../dashboard.models';
import { I18nService } from '../../core/i18n.service';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;

export interface LivePreviewCameraOption {
  readonly cameraId: string;
  readonly displayName: string;
}

/**
 * Camera lookup by name, start-live/stop-live, stream token/URL, and
 * hub-availability detection all live in DashboardPage, matching how every
 * other widget here (printer-navigation, printer-temperatures) leaves
 * backend calls to the parent. Playback retry (imageSrc/onPreviewError/
 * onPreviewLoad below) is presentation-layer only — no HTTP of its own —
 * and is ported from VideosDashboardPage's app-video-player, which needs
 * the exact same mechanism for the exact same reason: start-live being
 * "accepted" doesn't mean the camera has started pushing frames yet, and
 * <img> never retries a failed load on its own.
 */
@Component({
  selector: 'app-live-preview',
  imports: [ButtonModule, FormsModule, SelectModule],
  templateUrl: './live-preview.html',
  styleUrl: './live-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LivePreview {
  protected readonly i18n = inject(I18nService);
  readonly preview = input.required<LivePreviewData>();
  /** Tokened MJPEG stream URL, resolved once start-live actually succeeded. Empty until then, even if `preview().active` is already true. */
  readonly streamUrl = input<string>('');
  /** True while a start-live/stop-live round trip is in flight — the toggle button should show a busy state and not be re-clickable. */
  readonly streaming = input<boolean>(false);
  /** False once the camera-registry lookup has failed or found no cameras at all — drives the blurred "unavailable" placeholder. */
  readonly hubAvailable = input<boolean>(true);
  /** Every camera-registry entry, for the source selector — not just the name-matched default. */
  readonly cameraOptions = input<readonly LivePreviewCameraOption[]>([]);
  readonly resolutionChanged = output<string>();
  readonly activeChanged = output<boolean>();
  readonly cameraChanged = output<string>();

  /**
   * start-live being "accepted" by the camera doesn't mean it has already
   * opened its own feed — there's a real window where the <img> connects
   * before frames are flowing. <img> never retries a failed load on its
   * own, so on error we re-bind [src] with a cache-busting query param a
   * few times before giving up.
   *
   * streamUrl() itself is stable across a stop -> change resolution ->
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
    const url = this.streamUrl();
    const active = this.preview().active;
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
    const baseUrl = this.streamUrl();
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
