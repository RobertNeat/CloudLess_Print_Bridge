import type { TranslationKey } from '../../core/i18n.service';
import type { TelemetryChartDataset } from '../dashboard.models';
import type { TelemetrySampleDto } from './mqtt-puppeteer-api.types';

/**
 * Pure sample -> chart-series mapping functions, kept free of Angular DI
 * (matching the coordinate-utils.ts convention) so they're trivially unit
 * testable. All three take the same samples array and never fabricate a
 * series the backend doesn't have data for — most notably, no chamber
 * *target* dataset, since the A1 has no chamber heater.
 */

function minuteLabels(samples: readonly TelemetrySampleDto[]): string[] {
  if (samples.length === 0) return [];
  const startMs = new Date(samples[0].capturedAt).getTime();
  return samples.map((sample) => {
    const elapsedMs = new Date(sample.capturedAt).getTime() - startMs;
    return String(Math.max(0, Math.round(elapsedMs / 60_000)));
  });
}

function seriesData(samples: readonly TelemetrySampleDto[], pick: (s: TelemetrySampleDto) => number | null): number[] {
  return samples.map((sample) => pick(sample) ?? 0);
}

function dataset(
  labelKey: TranslationKey,
  colorToken: string,
  data: number[],
  extra?: Partial<TelemetryChartDataset>,
): TelemetryChartDataset {
  return { labelKey, colorToken, data, fill: false, ...extra };
}

export function mapProgressChart(samples: readonly TelemetrySampleDto[]): {
  labels: string[];
  datasets: TelemetryChartDataset[];
} {
  return {
    labels: minuteLabels(samples),
    datasets: [
      dataset('chart.series.progress', '--semantic-chart-series-1', seriesData(samples, (s) => s.progressPercent), {
        tension: 0.25,
      }),
    ],
  };
}

export function mapTemperatureChart(samples: readonly TelemetrySampleDto[]): {
  labels: string[];
  datasets: TelemetryChartDataset[];
} {
  const labels = minuteLabels(samples);
  const dashed = { borderDash: [6, 4] as [number, number], pointStyle: 'rectRot' as const };
  return {
    labels,
    datasets: [
      dataset(
        'chart.series.nozzleTarget',
        '--semantic-chart-series-4',
        seriesData(samples, (s) => s.nozzleTemperatureTarget),
        dashed,
      ),
      dataset(
        'chart.series.nozzleCurrent',
        '--semantic-chart-series-5',
        seriesData(samples, (s) => s.nozzleTemperatureCurrent),
        { fill: '-1' },
      ),
      dataset(
        'chart.series.bedTarget',
        '--semantic-chart-series-6',
        seriesData(samples, (s) => s.bedTemperatureTarget),
        dashed,
      ),
      dataset(
        'chart.series.bedCurrent',
        '--semantic-chart-series-7',
        seriesData(samples, (s) => s.bedTemperatureCurrent),
        { fill: '-1' },
      ),
      // Chamber has current-only data — no chamber-target dataset exists
      // because the A1 has no chamber heater to set a target for.
      dataset(
        'chart.series.chamberCurrent',
        '--semantic-chart-series-3',
        seriesData(samples, (s) => s.chamberTemperatureCurrent),
        { fill: '-1' },
      ),
    ],
  };
}

export function mapFanChart(samples: readonly TelemetrySampleDto[]): {
  labels: string[];
  datasets: TelemetryChartDataset[];
} {
  return {
    labels: minuteLabels(samples),
    datasets: [
      dataset(
        'chart.series.auxFan',
        '--semantic-chart-series-8',
        seriesData(samples, (s) => s.auxiliaryFanPercent),
        { stepped: 'middle' },
      ),
      dataset(
        'chart.series.partFan',
        '--semantic-chart-series-9',
        seriesData(samples, (s) => s.coolingFanPercent),
        { stepped: 'middle' },
      ),
    ],
  };
}
