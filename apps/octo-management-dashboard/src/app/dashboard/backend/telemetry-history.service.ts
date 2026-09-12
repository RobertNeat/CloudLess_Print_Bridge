import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MqttPuppeteerConfig } from './mqtt-puppeteer.config';
import type { TelemetryHistoryResponseDto } from './mqtt-puppeteer-api.types';

@Injectable({ providedIn: 'root' })
export class TelemetryHistoryService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(MqttPuppeteerConfig);

  async fetchHistory(): Promise<TelemetryHistoryResponseDto> {
    return firstValueFrom(
      this.http.get<TelemetryHistoryResponseDto>(`${this.config.baseUrl}/telemetry/history`),
    );
  }
}
