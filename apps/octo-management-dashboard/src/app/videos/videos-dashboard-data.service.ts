import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { VideosDashboardData } from './videos-dashboard.models';

const metricCodes = [
  'status',
  'power',
  'mode',
  'resolution',
  'fps',
  'temperature',
  'cameraIp',
  'serviceIp',
] as const;
const metricValueCodes = ['stream', 'enabled', 'ready'] as const;
const mediaKinds = ['audio', 'recording', 'timelapse', 'image'] as const;
const locationCodes = ['printerChamber', 'buildPlate', 'workshop'] as const;

@Injectable({ providedIn: 'root' })
export class VideosDashboardDataService {
  private readonly http = inject(HttpClient);

  async load(): Promise<VideosDashboardData> {
    const source = await firstValueFrom(this.http.get<unknown>('/mock-data/videos-dashboard.json'));
    if (!isVideosDashboardData(source)) {
      throw new Error('Mock videos dashboard data has an invalid shape.');
    }
    return structuredClone(source);
  }
}

export function isVideosDashboardData(value: unknown): value is VideosDashboardData {
  if (!isRecord(value) || !isRecord(value['player'])) return false;
  const player = value['player'];
  const metrics = value['metrics'];
  const sources = value['sources'];
  const media = value['media'];
  return (
    Array.isArray(metrics) &&
    metrics.every(isMetric) &&
    Array.isArray(sources) &&
    sources.every(isSource) &&
    Array.isArray(media) &&
    media.every(isMediaItem) &&
    typeof player['active'] === 'boolean' &&
    typeof player['selectedSourceId'] === 'string' &&
    typeof player['resolution'] === 'string' &&
    Array.isArray(player['availableResolutions']) &&
    player['availableResolutions'].every((option) => typeof option === 'string') &&
    sources.some((source) => source.id === player['selectedSourceId'])
  );
}

function isMetric(value: unknown): boolean {
  if (!isRecord(value) || !metricCodes.includes(value['code'] as never)) return false;
  const rawValue = value['value'];
  const valueCode = value['valueCode'];
  return (
    ((typeof rawValue === 'string' || isFiniteNumber(rawValue)) && valueCode === undefined) ||
    (rawValue === undefined && metricValueCodes.includes(valueCode as never))
  );
}

function isSource(value: unknown): value is VideosDashboardData['sources'][number] {
  return (
    isRecord(value) &&
    ['id', 'name'].every((key) => typeof value[key] === 'string') &&
    locationCodes.includes(value['locationCode'] as never) &&
    (value['status'] === 'online' || value['status'] === 'offline') &&
    (value['previewUrl'] === undefined || typeof value['previewUrl'] === 'string') &&
    (value['status'] === 'offline' || typeof value['previewUrl'] === 'string')
  );
}

function isMediaItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['id', 'name', 'sourceId', 'capturedAt'].every((key) => typeof value[key] === 'string') &&
    mediaKinds.includes(value['kind'] as never) &&
    !Number.isNaN(Date.parse(value['capturedAt'] as string)) &&
    (value['duration'] === undefined || typeof value['duration'] === 'string') &&
    (value['thumbnailUrl'] === undefined || typeof value['thumbnailUrl'] === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
