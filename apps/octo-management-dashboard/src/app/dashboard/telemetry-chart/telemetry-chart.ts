import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type {
  ChartConfiguration,
  ChartDataset,
  Plugin,
  ScriptableContext,
  TooltipItem,
} from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import type { TelemetryChartData, TelemetryChartDataset } from '../dashboard.models';

const hoverGuidePlugin: Plugin<'line'> = {
  id: 'telemetryHoverGuide',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements();
    if (!active?.length) return;

    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = getComputedStyle(chart.canvas).color;
    ctx.stroke();
    ctx.restore();
  },
};

@Component({
  selector: 'app-telemetry-chart',
  imports: [BaseChartDirective],
  templateUrl: './telemetry-chart.html',
  styleUrl: './telemetry-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TelemetryChart {
  readonly chart = input.required<TelemetryChartData>();
  protected readonly plugins: Plugin<'line'>[] = [hoverGuidePlugin];

  protected readonly data = computed<ChartConfiguration<'line'>['data']>(() => ({
    labels: this.chart().labels,
    datasets: this.chart().datasets.map((dataset) => this.prepareDataset(dataset)),
  }));

  protected readonly options = computed<ChartConfiguration<'line'>['options']>(() => {
    const chart = this.chart();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: 'index', axis: 'x' },
      hover: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: chart.datasets.length > 1,
          position: 'bottom',
          onHover: (event) => {
            if (event.native?.target instanceof HTMLElement) event.native.target.style.cursor = 'pointer';
          },
          onLeave: (event) => {
            if (event.native?.target instanceof HTMLElement) event.native.target.style.cursor = 'default';
          },
          labels: {
            boxWidth: 9,
            boxHeight: 9,
            padding: 10,
            usePointStyle: true,
            color: '#94a3b8',
            font: { size: 9 },
          },
        },
        tooltip: {
          enabled: true,
          position: 'nearest',
          callbacks: {
            title: (items: TooltipItem<'line'>[]) =>
              items.length ? `Czas: ${items[0].label} min` : '',
            label: (item: TooltipItem<'line'>) =>
              `${item.dataset.label}: ${item.formattedValue}${chart.valueSuffix}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: 'rgba(148, 163, 184, .28)' },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 7,
            color: '#94a3b8',
            font: { size: 9 },
            callback(value) {
              return `${this.getLabelForValue(Number(value))} min`;
            },
          },
          title: {
            display: true,
            text: chart.xAxisLabel,
            color: '#94a3b8',
            font: { size: 9, weight: 600 },
          },
        },
        y: {
          min: chart.yMin,
          max: chart.yMax,
          grid: { color: 'rgba(148, 163, 184, .13)' },
          border: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 9 },
            stepSize: chart.yStepSize,
            callback: (value) => `${value}${chart.valueSuffix}`,
          },
          title: {
            display: true,
            text: chart.yAxisLabel,
            color: '#94a3b8',
            font: { size: 9, weight: 600 },
          },
        },
      },
      elements: {
        line: { borderWidth: 2, tension: chart.kind === 'fan' ? 0 : 0.28 },
        point: { radius: 0, hoverRadius: 4, hoverBorderWidth: 2 },
      },
    };
  });

  private prepareDataset(dataset: TelemetryChartDataset): ChartDataset<'line', number[]> {
    const prepared: ChartDataset<'line', number[]> = {
      ...dataset,
      fill: dataset.fill ?? false,
      pointRadius: dataset.pointRadius ?? 0,
      pointHoverRadius: dataset.pointHoverRadius ?? 4,
    };

    if (dataset.gradientColors) {
      const colors = dataset.gradientColors;
      prepared.borderColor = (context) => this.createVerticalGradient(context, colors);
    }

    delete (prepared as TelemetryChartDataset).gradientColors;
    return prepared;
  }

  private createVerticalGradient(
    context: ScriptableContext<'line'>,
    colors: [string, string],
  ): string | CanvasGradient {
    const area = context.chart.chartArea;
    if (!area) return colors[0];

    const gradient = context.chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    return gradient;
  }
}
