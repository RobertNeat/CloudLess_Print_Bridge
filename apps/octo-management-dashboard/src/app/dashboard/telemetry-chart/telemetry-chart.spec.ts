import { TestBed } from '@angular/core/testing';
import { TelemetryChart } from './telemetry-chart';
import type { TelemetryChartData } from '../dashboard.models';

function sampleChart(overrides: Partial<TelemetryChartData> = {}): TelemetryChartData {
  return {
    kind: 'progress',
    titleKey: 'chart.progress.title',
    subtitleKey: 'chart.progress.subtitle',
    xAxisLabelKey: 'chart.axis.time',
    yAxisLabelKey: 'chart.axis.progress',
    yMin: 0,
    yMax: 100,
    yStepSize: 10,
    valueSuffix: '%',
    labels: [],
    datasets: [],
    ...overrides,
  };
}

describe('TelemetryChart', () => {
  it('reacts to a new [chart] input value by recomputing chart.js data (regression: live telemetry updates must reach the rendered chart)', () => {
    const fixture = TestBed.createComponent(TelemetryChart);
    fixture.componentRef.setInput('chart', sampleChart({ labels: [], datasets: [] }));
    fixture.detectChanges();
    expect(fixture.componentInstance['data']().labels).toEqual([]);

    fixture.componentRef.setInput(
      'chart',
      sampleChart({
        labels: ['0', '1', '2'],
        datasets: [
          { labelKey: 'chart.series.progress', colorToken: '--semantic-chart-series-1', data: [0, 40, 80], fill: false },
        ],
      }),
    );
    fixture.detectChanges();

    expect(fixture.componentInstance['data']().labels).toEqual(['0', '1', '2']);
    expect(fixture.componentInstance['data']().datasets[0].data).toEqual([0, 40, 80]);
  });

  it('never fabricates data when given empty samples', () => {
    const fixture = TestBed.createComponent(TelemetryChart);
    fixture.componentRef.setInput('chart', sampleChart());
    fixture.detectChanges();

    expect(fixture.componentInstance['data']().labels).toEqual([]);
    expect(fixture.componentInstance['data']().datasets).toEqual([]);
  });
});
