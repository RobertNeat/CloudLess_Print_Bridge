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

const MAX_MP4_PLAYBACK_RETRIES = 3;

/**
 * Preview/CRUD popup for one recorded media item. The hub transcodes eagerly
 * and synchronously the moment a resource's manifest reports complete (see
 * TranscodingService/CameraIngestController in video-service-hub) — there is
 * no client-visible "transcode" step, endpoint, or intermediate not-ready
 * state, and captures are still-JPEGs that were never transcoded to begin
 * with. So playback is uniformly: acquire a media token for the item's kind,
 * then hand the tokened downloadUrl straight to the right player —
 * <audio> for audio, <img> for a capture ('image'), Mp4Player (Video.js +
 * native HTTP Range requests) for anything MP4 ('recording', 'timelapse',
 * 'live'). No POST-transcode-then-retry-then-play flow, and no MJPEG-polling
 * or frame-slider fallback: those covered states (an un-transcoded MP4, or a
 * timelapse only browsable as loose still frames) no longer exist on the
 * wire.
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
  protected readonly audioSrc = signal('');
  protected readonly imageSrc = signal('');
  protected readonly mp4Src = signal('');
  protected readonly mp4PlaybackFailed = signal(false);

  protected readonly renaming = signal(false);
  protected readonly renameValue = signal('');
  protected readonly renameSaving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly actionError = signal(false);

  private readonly mp4Kinds = new Set<MediaItem['kind']>(['recording', 'timelapse', 'live']);

  protected isMp4(item: MediaItem): boolean {
    return this.mp4Kinds.has(item.kind);
  }

  /**
   * Whether the player box should keep its fixed 12rem-20rem height budget.
   * Only the mp4 player is exempt: it sizes itself from the clip's own
   * aspect ratio (video.js fluid mode) and the dialog grows to fit it,
   * rather than being letterboxed/clipped into a fixed box like every other
   * media type.
   */
  protected readonly playerIsBounded = computed(() => {
    const item = this.item();
    const showingMp4Player =
      !!item && this.isMp4(item) && !!this.mp4Src() && !this.mp4PlaybackFailed();
    return !showingMp4Player;
  });

  protected readonly displayName = computed(
    () => this.item()?.displayName || this.item()?.name || '',
  );

  private mp4PlaybackRetryCount = 0;

  private readonly loadOnItemChange = effect(() => {
    const item = this.item();
    this.resetState();
    if (!item) return;
    void this.startPlayback(item);
  });

  private resetState(): void {
    this.loading.set(false);
    this.loadFailed.set(false);
    this.audioSrc.set('');
    this.imageSrc.set('');
    this.mp4Src.set('');
    this.mp4PlaybackFailed.set(false);
    this.renaming.set(false);
    this.renameValue.set('');
    this.deleting.set(false);
    this.actionError.set(false);
    this.mp4PlaybackRetryCount = 0;
  }

  private async startPlayback(item: MediaItem): Promise<void> {
    if (!item.requestId || !item.downloadUrl) return;
    this.loading.set(true);
    try {
      const token = await this.mediaTokens.acquire({
        kind: mediaKindToTokenKind(item.kind),
        cameraId: item.sourceId,
        requestId: item.requestId,
      });
      const url = this.mediaTokens.buildTokenedUrl(item.downloadUrl, token);
      if (item.kind === 'audio') {
        this.audioSrc.set(url);
      } else if (item.kind === 'image') {
        this.imageSrc.set(url);
      } else {
        this.mp4Src.set(url);
      }
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** A playback error re-acquires a fresh media token (the failure is assumed to be a stale/expired token or transient stream hiccup) rather than restarting playback from scratch. */
  protected onMp4PlaybackError(): void {
    const item = this.item();
    if (!item || this.mp4PlaybackRetryCount >= MAX_MP4_PLAYBACK_RETRIES) {
      this.mp4PlaybackFailed.set(true);
      return;
    }
    this.mp4PlaybackRetryCount += 1;
    void this.acquireAndSetMp4Src(item);
  }

  private async acquireAndSetMp4Src(item: MediaItem): Promise<void> {
    if (!item.requestId || !item.downloadUrl) return;
    try {
      const token = await this.mediaTokens.acquire({
        kind: mediaKindToTokenKind(item.kind),
        cameraId: item.sourceId,
        requestId: item.requestId,
      });
      this.mp4Src.set(this.mediaTokens.buildTokenedUrl(item.downloadUrl, token));
      this.mp4PlaybackFailed.set(false);
    } catch {
      this.mp4PlaybackFailed.set(true);
    }
  }

  protected retryMp4(): void {
    const item = this.item();
    if (!item) return;
    this.mp4PlaybackRetryCount = 0;
    void this.startPlayback(item);
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
