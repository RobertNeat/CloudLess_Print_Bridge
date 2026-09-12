import { mapFanChart, mapProgressChart, mapTemperatureChart } from './telemetry-mapping';
import type { TelemetrySampleDto } from './mqtt-puppeteer-api.types';

function sample(overrides: Partial<TelemetrySampleDto> = {}): TelemetrySampleDto {
  return {
    capturedAt: '2026-09-12T10:00:00.000Z',
    progressPercent: null,
    nozzleTemperatureCurrent: null,
    nozzleTemperatureTarget: null,
    bedTemperatureCurrent: null,
    bedTemperatureTarget: null,
    chamberTemperatureCurrent: null,
    coolingFanPercent: null,
    auxiliaryFanPercent: null,
    ...overrides,
  };
}

describe('mapProgressChart', () => {
  it('returns empty labels and a single empty-data series for an empty buffer', () => {
    const result = mapProgressChart([]);

    expect(result.labels).toEqual([]);
    expect(result.datasets).toHaveLength(1);
    expect(result.datasets[0].data).toEqual([]);
  });

  it('maps a single sample to a single zero-minute label', () => {
    const result = mapProgressChart([sample({ progressPercent: 50 })]);

    expect(result.labels).toEqual(['0']);
    expect(result.datasets[0].data).toEqual([50]);
  });

  it('turns elapsed time between samples into minute labels', () => {
    const result = mapProgressChart([
      sample({ capturedAt: '2026-09-12T10:00:00.000Z', progressPercent: 0 }),
      sample({ capturedAt: '2026-09-12T10:05:00.000Z', progressPercent: 10 }),
      sample({ capturedAt: '2026-09-12T10:10:00.000Z', progressPercent: 20 }),
    ]);

    expect(result.labels).toEqual(['0', '5', '10']);
    expect(result.datasets[0].data).toEqual([0, 10, 20]);
  });

  it('substitutes 0 instead of null/NaN for missing optional fields', () => {
    const result = mapProgressChart([sample({ progressPercent: null })]);

    expect(result.datasets[0].data).toEqual([0]);
    expect(result.datasets[0].data.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe('mapTemperatureChart', () => {
  it('never fabricates a chamber target dataset', () => {
    const result = mapTemperatureChart([sample({ chamberTemperatureCurrent: 28 })]);

    expect(result.datasets.some((d) => d.labelKey === 'chart.series.chamberTarget')).toBe(false);
    expect(result.datasets.some((d) => d.labelKey === 'chart.series.chamberCurrent')).toBe(true);
  });

  it('includes nozzle and bed current/target series', () => {
    const result = mapTemperatureChart([
      sample({
        nozzleTemperatureCurrent: 210,
        nozzleTemperatureTarget: 220,
        bedTemperatureCurrent: 55,
        bedTemperatureTarget: 60,
      }),
    ]);

    const byKey = Object.fromEntries(result.datasets.map((d) => [d.labelKey, d.data]));
    expect(byKey['chart.series.nozzleCurrent']).toEqual([210]);
    expect(byKey['chart.series.nozzleTarget']).toEqual([220]);
    expect(byKey['chart.series.bedCurrent']).toEqual([55]);
    expect(byKey['chart.series.bedTarget']).toEqual([60]);
  });
});

describe('mapFanChart', () => {
  it('maps cooling and auxiliary fan percentages, no chamber-fan dataset (unavailable from history)', () => {
    const result = mapFanChart([sample({ coolingFanPercent: 40, auxiliaryFanPercent: 15 })]);

    const byKey = Object.fromEntries(result.datasets.map((d) => [d.labelKey, d.data]));
    expect(byKey['chart.series.partFan']).toEqual([40]);
    expect(byKey['chart.series.auxFan']).toEqual([15]);
    expect(result.datasets.some((d) => d.labelKey === 'chart.series.chamberFan')).toBe(false);
  });

  it('handles an empty sample buffer without throwing', () => {
    expect(() => mapFanChart([])).not.toThrow();
    expect(mapFanChart([]).labels).toEqual([]);
  });
});
