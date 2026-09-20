import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { VideoServiceHubConfig } from './video-service-hub.config';

const MAX_LIVE_DURATION_MS = 600_000;
/**
 * 24h — for a viewer meant to stay open across an entire print, well past
 * the Videos page's 10-minute default. Still an explicit, bounded value
 * (never omitted): the hub has no independent timer of its own for a live
 * session — see video-service-hub's camera-command.validator.ts — so
 * maxDurationMs relies on the camera firmware to actually self-stop at that
 * point, which is the only thing that guarantees an orphaned session (tab
 * closed, browser crashed, network dropped — none of which ngOnDestroy can
 * catch) eventually ends on its own rather than running forever.
 */
export const UNBOUNDED_VIEWER_MAX_DURATION_MS = 86_400_000;

/**
 * Sends camera commands (start-live/stop-live) to video-service-hub, which
 * proxies them over HTTP directly to the camera's own baseUrl. Kept separate
 * from HttpVideosDataService/VideosRepositoryPort so the mock data service
 * (the fallback implementation of that port) is unaffected.
 */
@Injectable({ providedIn: 'root' })
export class CameraCommandApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(VideoServiceHubConfig);

  /**
   * `persist` controls whether the hub keeps the finished live-view session
   * as a media-library 'live' recording once stop-live is issued or the
   * camera's connection ends (see video-service-hub's
   * MediaStorageService.storeLive / livePersistIntent). Defaults to true,
   * matching the hub's own default and every existing caller of this method
   * (e.g. the Videos page, which lists 'live' sessions in its recordings
   * library) — pass false only for a viewer that must never leave a saved
   * recording behind, such as the printer dashboard's live-preview widget.
   *
   * `maxDurationMs` defaults to the hub's own historical ceiling (600_000 /
   * 10 minutes) to preserve existing behavior for every caller that doesn't
   * override it (e.g. the Videos page, typically watched for a few minutes
   * at a time). Always pass an explicit, bounded value — never omit it — so
   * the camera itself guarantees the session ends even if this client never
   * calls stopLive; see UNBOUNDED_VIEWER_MAX_DURATION_MS for the value a
   * long-lived viewer (e.g. the printer dashboard's live-preview widget)
   * should pass instead.
   */
  async startLive(
    cameraId: string,
    cameraBaseUrl: string,
    resolution: string,
    requestId: string,
    persist = true,
    maxDurationMs = MAX_LIVE_DURATION_MS,
  ): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.config.baseUrl}/api/v1/cameras/${encodeURIComponent(cameraId)}/commands/start-live`,
        {
          cameraBaseUrl,
          requestId,
          resolution,
          maxDurationMs,
          persist,
        },
      ),
    );
  }

  async stopLive(cameraId: string, cameraBaseUrl: string, requestId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.config.baseUrl}/api/v1/cameras/${encodeURIComponent(cameraId)}/commands/stop-live`,
        { cameraBaseUrl, requestId },
      ),
    );
  }

  async captureImage(
    cameraId: string,
    cameraBaseUrl: string,
    resolution: string,
    requestId: string,
  ): Promise<void> {
    await this.sendCommand(cameraId, 'capture', { cameraBaseUrl, requestId, resolution });
  }

  async startTimelapse(
    cameraId: string,
    cameraBaseUrl: string,
    resolution: string,
    intervalMs: number,
    durationMs: number,
    requestId: string,
  ): Promise<void> {
    await this.sendCommand(cameraId, 'periodic-capture', {
      cameraBaseUrl,
      requestId,
      resolution,
      intervalMs,
      durationMs,
    });
  }

  async startTimedRecording(
    cameraId: string,
    cameraBaseUrl: string,
    resolution: string,
    durationMs: number,
    requestId: string,
  ): Promise<void> {
    await this.sendCommand(cameraId, 'timed-recording', {
      cameraBaseUrl,
      requestId,
      resolution,
      durationMs,
    });
  }

  async startRecording(
    cameraId: string,
    cameraBaseUrl: string,
    resolution: string,
    requestId: string,
  ): Promise<void> {
    await this.sendCommand(cameraId, 'start-recording', { cameraBaseUrl, requestId, resolution });
  }

  async stopRecording(cameraId: string, cameraBaseUrl: string, requestId: string): Promise<void> {
    await this.sendCommand(cameraId, 'stop-recording', { cameraBaseUrl, requestId });
  }

  async recordAudio(
    cameraId: string,
    cameraBaseUrl: string,
    durationSeconds: number,
    requestId: string,
  ): Promise<void> {
    await this.sendCommand(cameraId, 'record-audio', { cameraBaseUrl, requestId, durationSeconds });
  }

  private async sendCommand(
    cameraId: string,
    command: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.config.baseUrl}/api/v1/cameras/${encodeURIComponent(cameraId)}/commands/${command}`,
        body,
      ),
    );
  }
}
