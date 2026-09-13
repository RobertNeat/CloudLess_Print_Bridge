import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { VideoServiceHubConfig } from './video-service-hub.config';

const MAX_LIVE_DURATION_MS = 600_000;

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

  async startLive(
    cameraId: string,
    cameraBaseUrl: string,
    resolution: string,
    requestId: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.config.baseUrl}/api/v1/cameras/${encodeURIComponent(cameraId)}/commands/start-live`,
        {
          cameraBaseUrl,
          requestId,
          resolution,
          maxDurationMs: MAX_LIVE_DURATION_MS,
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
