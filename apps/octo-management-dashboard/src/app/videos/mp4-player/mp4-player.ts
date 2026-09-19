import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import { I18nService } from '../../core/i18n.service';
import { toBufferedSegments, type BufferedSegment } from './buffered-ranges';

/**
 * Thin Video.js wrapper for MP4 playback served over HTTP Range requests
 * (native browser progressive download + seeking — no MediaSource/chunk
 * scheduling on our side). Renders a buffered-ranges bar from
 * player.buffered() so the user can see which parts of the file have
 * actually arrived. On a playback error, re-emits `playbackError` so the
 * parent (which owns the media-token lifecycle) can retry by re-acquiring a
 * token and setting a fresh `src`; this component never retries client-side
 * on its own; see media-preview.ts for why a per-byte-range retry isn't
 * reachable once playback is handed to the native <video> element.
 */
@Component({
  selector: 'app-mp4-player',
  templateUrl: './mp4-player.html',
  styleUrl: './mp4-player.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mp4Player implements AfterViewInit, OnDestroy {
  protected readonly i18n = inject(I18nService);

  readonly src = input<string>('');
  readonly playbackError = output<void>();

  private readonly videoElement = viewChild.required<ElementRef<HTMLVideoElement>>('videoElement');

  protected readonly bufferedSegments = signal<readonly BufferedSegment[]>([]);
  protected readonly playedPercent = signal(0);

  private player: Player | undefined;

  private readonly applySrc = effect(() => {
    const url = this.src();
    const player = this.player;
    if (!player || !url) return;
    this.bufferedSegments.set([]);
    this.playedPercent.set(0);
    player.src({ src: url, type: 'video/mp4' });
  });

  ngAfterViewInit(): void {
    this.player = videojs(this.videoElement().nativeElement, {
      controls: true,
      fluid: true,
      preload: 'auto',
    });
    this.player.on('error', () => this.playbackError.emit());
    this.player.on('progress', () => this.updateBufferedSegments());
    this.player.on('timeupdate', () => this.updatePlayedPercent());
    this.player.on('loadedmetadata', () => this.updateBufferedSegments());
    const url = this.src();
    if (url) {
      this.player.src({ src: url, type: 'video/mp4' });
    }
  }

  ngOnDestroy(): void {
    this.player?.dispose();
    this.player = undefined;
  }

  private updateBufferedSegments(): void {
    const player = this.player;
    if (!player) return;
    const duration = player.duration();
    this.bufferedSegments.set(toBufferedSegments(player.buffered(), duration));
  }

  private updatePlayedPercent(): void {
    const player = this.player;
    if (!player) return;
    const duration = player.duration();
    if (!Number.isFinite(duration) || duration <= 0) {
      this.playedPercent.set(0);
      return;
    }
    this.playedPercent.set((player.currentTime() / duration) * 100);
  }
}
