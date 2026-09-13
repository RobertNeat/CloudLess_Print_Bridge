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
import type { MediaItem } from '../videos-dashboard.models';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;

type CaptureFrame = { readonly fileName: string; readonly sequence: number };

/**
 * Preview/CRUD popup for one recorded media item. Recordings are served as
 * multipart/x-mixed-replace MJPEG (same as live view) which <video> cannot
 * decode, so they're played back via <img>, reusing VideoPlayer's
 * cache-bust-on-open + retry-on-error technique. Timelapses are a sequence
 * of still capture frames (backend has no distinct 'timelapse' kind — it's
 * derived client-side as an 'image' item with frameCount > 1) browsed with a
 * frame slider, fetching a fresh per-frame media token as the user scrubs.
 */
@Component({
  selector: 'app-media-preview',
  imports: [ButtonModule, DialogModule, FormsModule, InputTextModule],
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
  protected readonly frames = signal<readonly CaptureFrame[]>([]);
  protected readonly frameIndex = signal(0);
  protected readonly frameSrc = signal('');
  protected readonly frameLoading = signal(false);

  protected readonly renaming = signal(false);
  protected readonly renameValue = signal('');
  protected readonly renameSaving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteConfirming = signal(false);
  protected readonly actionError = signal(false);

  protected readonly isTimelapse = computed(() => {
    const item = this.item();
    return item?.kind === 'image' && (item.frameCount ?? 0) > 1;
  });

  protected readonly displayName = computed(
    () => this.item()?.displayName || this.item()?.name || '',
  );

  private retryCount = 0;
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
    this.frames.set([]);
    this.frameIndex.set(0);
    this.frameSrc.set('');
    this.frameLoading.set(false);
    this.renaming.set(false);
    this.renameValue.set('');
    this.deleteConfirming.set(false);
    this.actionError.set(false);
    this.retryCount = 0;
    this.frameTokenCache.clear();
  }

  private async startPlayback(item: MediaItem): Promise<void> {
    if (!item.requestId || !item.downloadUrl) return;
    this.loading.set(true);
    try {
      if (item.kind === 'image' && (item.frameCount ?? 0) > 1) {
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

  protected confirmDelete(): void {
    this.deleteConfirming.set(true);
  }

  protected cancelDelete(): void {
    this.deleteConfirming.set(false);
  }

  protected async deleteItem(): Promise<void> {
    const item = this.item();
    if (!item?.requestId || this.deleting()) return;
    this.deleting.set(true);
    this.actionError.set(false);
    try {
      await this.mediaLibrary.delete(item.kind, item.sourceId, item.requestId);
      this.changed.emit();
      this.close();
    } catch {
      this.actionError.set(true);
      this.deleting.set(false);
      this.deleteConfirming.set(false);
    }
  }
}

function withCacheBust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}_r=${Date.now()}`;
}
