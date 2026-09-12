import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ManagementDashboardData } from './dashboard.models';

export interface ManagementDashboardDataSource {
  load(): Promise<ManagementDashboardData>;
}

@Injectable({ providedIn: 'root' })
export class MockManagementDashboardDataSource implements ManagementDashboardDataSource {
  private readonly http = inject(HttpClient);

  async load(): Promise<ManagementDashboardData> {
    const parsed: unknown = await firstValueFrom(
      this.http.get<unknown>('/mock-data/management-dashboard.json'),
    );
    if (!isManagementDashboardData(parsed)) {
      throw new Error('Management dashboard data has an invalid shape.');
    }
    return structuredClone(parsed);
  }
}

export const MANAGEMENT_DASHBOARD_DATA_SOURCE = new InjectionToken<ManagementDashboardDataSource>(
  'MANAGEMENT_DASHBOARD_DATA_SOURCE',
  {
    providedIn: 'root',
    factory: () => inject(MockManagementDashboardDataSource),
  },
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isNullableNumber = (value: unknown): value is number | null =>
  value === null || isNumber(value);
const hasNumbers = (value: unknown, keys: readonly string[]): boolean =>
  isRecord(value) && keys.every((key) => isNumber(value[key]));

function isManagementDashboardData(value: unknown): value is ManagementDashboardData {
  if (!isRecord(value)) return false;
  const {
    printJob,
    controls,
    temperatures,
    coordinates,
    positionSource,
    axisRanges,
    deviceCapabilities,
    navigation,
    livePreview,
    widgets,
    charts,
  } = value;
  return (
    isRecord(printJob) &&
    ['name', 'thumbnailUrl', 'thumbnailAlt', 'estimatedPrintTime'].every((key) =>
      isString(printJob[key]),
    ) &&
    ['progress', 'currentLayer', 'totalLayers'].every((key) => isNumber(printJob[key])) &&
    ['printing', 'paused', 'completed', 'cancelled', 'error'].includes(
      String(printJob['status']),
    ) &&
    isRecord(controls) &&
    typeof controls['lightEnabled'] === 'boolean' &&
    typeof controls['fansEnabled'] === 'boolean' &&
    isNumber(controls['fanSpeed']) &&
    ['silent', 'standard', 'sport', 'ludicrous'].includes(String(controls['printSpeed'])) &&
    isRecord(temperatures) &&
    ['chamber', 'bed', 'nozzle'].every((key) => isNullableNumber(temperatures[key])) &&
    hasNumbers(coordinates, ['X', 'Y', 'Z']) &&
    ['unknown', 'homed', 'commanded'].includes(String(positionSource)) &&
    isAxisRanges(axisRanges) &&
    isDeviceCapabilities(deviceCapabilities) &&
    isNavigation(navigation) &&
    isLivePreview(livePreview) &&
    Array.isArray(widgets) &&
    widgets.every(isWidget) &&
    isRecord(charts) &&
    ['progress', 'temperature', 'fan'].every((key) => isChart(charts[key]))
  );
}

function isAxisRanges(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['X', 'Y', 'Z'].every((axis) => {
    const range = value[axis];
    return (
      isRecord(range) &&
      isNumber(range['min']) &&
      isNumber(range['max']) &&
      range['min'] <= range['max']
    );
  });
}

function isDeviceCapabilities(value: unknown): boolean {
  return isRecord(value) && typeof value['hasChamberHeater'] === 'boolean';
}

function isNavigation(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value['axisPoints']) || !isRecord(value['viewport']))
    return false;
  const viewport = value['viewport'];
  return (
    ['X', 'Y', 'Z'].every(
      (axis) => isRecord(value['axisPoints']) && isRecord(value['axisPoints'][axis]),
    ) &&
    isRecord(value['hotendPoint']) &&
    hasNumbers(value['hotendPoint'], ['x', 'y']) &&
    Array.isArray(value['steps']) &&
    value['steps'].every(isNumber) &&
    isString(viewport['imageUrl']) &&
    isString(viewport['imageAlt']) &&
    isNumber(viewport['width']) &&
    isNumber(viewport['height']) &&
    hasNumbers(viewport['viewBox'], ['minX', 'minY', 'width', 'height'])
  );
}

function isLivePreview(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['cameraName']) &&
    isString(value['resolution']) &&
    Array.isArray(value['availableResolutions']) &&
    value['availableResolutions'].every(isString) &&
    typeof value['active'] === 'boolean' &&
    isNumber(value['latencyMs'])
  );
}

function isWidget(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['type']) &&
    ['x', 'y', 'cols', 'rows'].every((key) => isNumber(value[key]))
  );
}

function isChart(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['progress', 'temperature', 'fan'].includes(String(value['kind'])) &&
    ['titleKey', 'subtitleKey', 'xAxisLabelKey', 'yAxisLabelKey', 'valueSuffix'].every((key) =>
      isString(value[key]),
    ) &&
    ['yMin', 'yMax', 'yStepSize'].every((key) => isNumber(value[key])) &&
    Array.isArray(value['labels']) &&
    value['labels'].every(isString) &&
    Array.isArray(value['datasets']) &&
    value['datasets'].every(
      (dataset) =>
        isRecord(dataset) &&
        isString(dataset['labelKey']) &&
        isString(dataset['colorToken']) &&
        Array.isArray(dataset['data']) &&
        dataset['data'].every(isNumber),
    )
  );
}

export { isManagementDashboardData };
