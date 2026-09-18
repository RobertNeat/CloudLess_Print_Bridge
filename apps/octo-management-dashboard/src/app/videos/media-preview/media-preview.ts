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
import { InputTextModule } from 'primeng/inputtext';
import { I18nService } from '../../core/i18n.service';
import { MediaLibraryApiService } from '../backend/media-library-api.service';
import { mediaKindToTokenKind, MediaTokenApiService } from '../backend/media-token-api.service';
import { Mp4Player } from '../mp4-player/mp4-player';
import type { MediaItem } from '../videos-dashboard.models';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;
const MAX_TRANSCODE_RETRIES = 3;
const TRANSCODE_RETRY_DELAY_MS = 1500;
const MAX_MP4_PLAYBACK_RETRIES = 3;

type CaptureFrame = { readonly fileName: string; readonly sequence: number };

/**
 * Preview/CRUD popup for one recorded media item. Recordings and timelapses
 * are both played back as MP4 via Mp4Player (Video.js + native HTTP Range
 * requests): clicking either triggers server-side transcoding (encodes
 * once, then a fast cached handoff on every later click -- a timelapse
 * re-encodes if a newer capture frame has arrived since) before a tokened
 * <video> src is set. A recording item with no transcodeUrl/mp4Url (older
 * backend, or a mock-data item) falls back to the legacy <img>-based MJPEG
 * playback, reusing VideoPlayer's cache-bust-on-open + retry-on-error
 * technique. A timelapse item with no transcodeUrl/mp4Url falls back to
 * browsing its still capture frames (kind: 'timelapse', backed by the same
 * multi-frame capture manifest as a multi-shot 'image') with a frame slider,
 * fetching a fresh per-frame media token as the user scrubs.
 */
@Component({
  selector: 'app-media-preview',
  imports: [ButtonModule, DialogModule, FormsModule, InputTextModule, Mp4Player],
  templateUrl: './media-preview.html',
  styleUrl: './media-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaPreview {
  protected readonly i18n = inject(I18nService);
  private readonly mediaTokens = inject(MediaTokenApiService);
  private readonly mediaLibrary = inject(MediaLibraryApiService);

  readonly item = input<MediaItem | null>(null);
  readonly sourceName = input<string>('');
  readonly closed = output<void>();
  readonly changed = output<void>();

  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly playbackFailed = signal(false);
  protected readonly playbackSrc = signal('');
  protected readonly audioSrc = signal('');
  protected readonly imageSrc = signal('');
  protected readonly mp4Src = signal('');
  protected readonly mp4Transcoding = signal(false);
  protected readonly mp4TranscodeFailed = signal(false);
  protected readonly mp4PlaybackFailed = signal(false);
  protected readonly frames = signal<readonly CaptureFrame[]>([]);
  protected readonly frameIndex = signal(0);
  protected readonly frameSrc = signal('');
  protected readonly frameLoading = signal(false);

  protected readonly renaming = signal(false);
  protected readonly renameValue = signal('');
  protected readonly renameSaving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly actionError = signal(false);

  /** True only when falling back to the frame-slider view: a timelapse with no transcodeUrl/mp4Url (older backend, or a mock-data item). */
  protected readonly isTimelapse = computed(
    () => this.item()?.kind === 'timelapse' && !this.hasMp4Source(),
  );

  private hasMp4Source(): boolean {
    const item = this.item();
    return (
      (item?.kind === 'recording' || item?.kind === 'timelapse') &&
      !!item.transcodeUrl &&
      !!item.mp4Url
    );
  }

  /**
   * Whether the player box should keep its fixed 12rem-20rem height budget.
   * Only the mp4 player is exempt: it sizes itself from the clip's own
   * aspect ratio (video.js fluid mode) and the dialog grows to fit it,
   * rather than being letterboxed/clipped into a fixed box like every other
   * media type.
   */
  protected readonly playerIsBounded = computed(() => {
    const showingMp4Player =
      this.hasMp4Source() &&
      !!this.mp4Src() &&
      !this.mp4Transcoding() &&
      !this.mp4TranscodeFailed() &&
      !this.mp4PlaybackFailed();
    return !showingMp4Player;
  });

  protected readonly displayName = computed(
    () => this.item()?.displayName || this.item()?.name || '',
  );

  private retryCount = 0;
  private mp4PlaybackRetryCount = 0;
  private readonly frameTokenCache = new Map<string, string>();

  private readonly loadOnItemChange = effect(() => {
    const item = this.item();
    this.resetState();
    if (!item) return;
    void this.startPlayback(item);
  });

  private resetState(): void {
    this.loading.set(false);
    this.loadFailed.set(false);
    this.playbackFailed.set(false);
    this.playbackSrc.set('');
    this.audioSrc.set('');
    this.imageSrc.set('');
    this.mp4Src.set('');
    this.mp4Transcoding.set(false);
    this.mp4TranscodeFailed.set(false);
    this.mp4PlaybackFailed.set(false);
    this.frames.set([]);
    this.frameIndex.set(0);
    this.frameSrc.set('');
    this.frameLoading.set(false);
    this.renaming.set(false);
    this.renameValue.set('');
    this.deleting.set(false);
    this.actionError.set(false);
    this.retryCount = 0;
    this.mp4PlaybackRetryCount = 0;
    this.frameTokenCache.clear();
  }

  private async startPlayback(item: MediaItem): Promise<void> {
    if (!item.requestId || !item.downloadUrl) return;
    this.loading.set(true);
    try {
      if ((item.kind === 'recording' || item.kind === 'timelapse') && item.transcodeUrl && item.mp4Url) {
        await this.startMp4Playback(item);
      } else if (item.kind === 'timelapse') {
        await this.loadTimelapseFrames(item);
      } else {
        const token = await this.mediaTokens.acquire({
          kind: mediaKindToTokenKind(item.kind),
          cameraId: item.sourceId,
          requestId: item.requestId,
        });
        const url = this.mediaTokens.buildTokenedUrl(item.downloadUrl, token);
        if (item.kind === 'audio') {
          this.audioSrc.set(url);
        } else if (item.kind === 'recording') {
          this.playbackSrc.set(withCacheBust(url));
        } else {
          this.imageSrc.set(url);
        }
      }
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Click-to-play for a recording or timelapse: (1) POST the transcode
   * endpoint, which encodes on first call and is a fast cached handoff on
   * every call after (MediaStorageService/TranscodingService cache the .mp4
   * on disk; a timelapse's cache is invalidated once a newer capture frame
   * has arrived) — retried a few times since a cold encode can outlast a
   * transient network blip; (2) acquire a 'recording-mp4' or 'capture-mp4'
   * media token, since a plain <video> element cannot send an Authorization
   * header; (3) hand the tokened URL to Mp4Player, which plays it via native
   * HTTP Range requests (browser-driven progressive download + seeking,
   * buffered-ranges bar from video.buffered()). See Mp4Player's doc comment
   * for why per-byte-range retry isn't reachable once playback is handed to
   * native <video>.
   */
  private async startMp4Playback(item: MediaItem): Promise<void> {
    if (!item.requestId || !item.transcodeUrl || !item.mp4Url) return;
    this.mp4Transcoding.set(true);
    this.mp4TranscodeFailed.set(false);
    try {
      await this.transcodeWithRetry(item.transcodeUrl);
    } catch {
      this.mp4TranscodeFailed.set(true);
      return;
    } finally {
      this.mp4Transcoding.set(false);
    }
    await this.acquireAndSetMp4Src(item);
  }

  private async transcodeWithRetry(transcodeUrl: string): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.mediaLibrary.transcode(transcodeUrl);
        return;
      } catch (error) {
        if (attempt >= MAX_TRANSCODE_RETRIES) throw error;
        await delay(TRANSCODE_RETRY_DELAY_MS);
      }
    }
  }

  private async acquireAndSetMp4Src(item: MediaItem): Promise<void> {
    if (!item.requestId || !item.mp4Url) return;
    try {
      const token = await this.mediaTokens.acquire({
        kind: item.kind === 'timelapse' ? 'capture-mp4' : 'recording-mp4',
        cameraId: item.sourceId,
        requestId: item.requestId,
      });
      this.mp4Src.set(this.mediaTokens.buildTokenedUrl(item.mp4Url, token));
      this.mp4PlaybackFailed.set(false);
    } catch {
      this.mp4TranscodeFailed.set(true);
    }
  }

  protected onMp4PlaybackError(): void {
    const item = this.item();
    if (!item || this.mp4PlaybackRetryCount >= MAX_MP4_PLAYBACK_RETRIES) {
      this.mp4PlaybackFailed.set(true);
      return;
    }
    this.mp4PlaybackRetryCount += 1;
    void this.acquireAndSetMp4Src(item);
  }

  protected retryMp4(): void {
    const item = this.item();
    if (!item) return;
    this.mp4PlaybackRetryCount = 0;
    void this.startMp4Playback(item);
  }

  private async loadTimelapseFrames(item: MediaItem): Promise<void> {
    if (!item.requestId) return;
    const items = await this.mediaLibrary.listCaptureFrames(item.sourceId, item.requestId);
    this.frames.set(items);
    if (items.length > 0) {
      await this.showFrame(0);
    }
  }

  protected async onFrameIndexChange(index: number): Promise<void> {
    this.frameIndex.set(index);
    await this.showFrame(index);
  }

  private async showFrame(index: number): Promise<void> {
    const item = this.item();
    const frame = this.frames()[index];
    if (!item?.requestId || !frame) return;
    this.frameLoading.set(true);
    try {
      let token = this.frameTokenCache.get(frame.fileName);
      if (!token) {
        token = await this.mediaTokens.acquire({
          kind: 'capture',
          cameraId: item.sourceId,
          requestId: item.requestId,
          fileName: frame.fileName,
        });
        this.frameTokenCache.set(frame.fileName, token);
      }
      const baseUrl = item.downloadUrl?.split('?')[0] ?? '';
      const url = `${baseUrl}?fileName=${encodeURIComponent(frame.fileName)}&mediaToken=${encodeURIComponent(token)}`;
      this.frameSrc.set(url);
    } catch {
      this.playbackFailed.set(true);
    } finally {
      this.frameLoading.set(false);
    }
  }

  protected onPlaybackError(): void {
    const item = this.item();
    if (!item?.downloadUrl || this.retryCount >= MAX_RETRIES) {
      this.playbackFailed.set(true);
      return;
    }
    this.retryCount += 1;
    setTimeout(() => {
      this.playbackSrc.update((current) => withCacheBust(current || item.downloadUrl!));
    }, RETRY_DELAY_MS);
  }

  protected onPlaybackLoad(): void {
    this.retryCount = 0;
    this.playbackFailed.set(false);
  }

  protected close(): void {
    this.closed.emit();
  }

  protected startRename(): void {
    this.renameValue.set(this.displayName());
    this.renaming.set(true);
  }

  protected cancelRename(): void {
    this.renaming.set(false);
  }

  protected async saveRename(): Promise<void> {
    const item = this.item();
    const value = this.renameValue().trim();
    if (!item?.requestId || value.length === 0 || this.renameSaving()) return;
    this.renameSaving.set(true);
    this.actionError.set(false);
    try {
      await this.mediaLibrary.rename(item.kind, item.sourceId, item.requestId, value);
      this.renaming.set(false);
      this.changed.emit();
    } catch {
      this.actionError.set(true);
    } finally {
      this.renameSaving.set(false);
    }
  }

  protected async deleteItem(): Promise<void> {
    const item = this.item();
    if (!item?.requestId || this.deleting()) return;
    this.deleting.set(true);
    this.actionError.set(false);
    try {
      await this.mediaLibrary.delete(item.kind, item.sourceId, item.requestId);
      this.deleting.set(false);
      this.changed.emit();
      this.close();
    } catch {
      this.actionError.set(true);
      this.deleting.set(false);
    }
  }
}

function withCacheBust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}_r=${Date.now()}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
