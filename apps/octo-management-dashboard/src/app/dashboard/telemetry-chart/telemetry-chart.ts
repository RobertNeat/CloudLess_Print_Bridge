import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type {
  ChartConfiguration,
  ChartDataset,
  Plugin,
  ScriptableContext,
  TooltipItem,
} from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { I18nService } from '../../core/i18n.service';
import { ThemeService } from '../../core/theme.service';
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
  private readonly document = inject(DOCUMENT);
  protected readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);
  readonly chart = input.required<TelemetryChartData>();
  protected readonly plugins: Plugin<'line'>[] = [hoverGuidePlugin];

  protected readonly data = computed<ChartConfiguration<'line'>['data']>(() => {
    this.i18n.language();
    return {
      labels: this.chart().labels,
      datasets: this.chart().datasets.map((dataset) => this.prepareDataset(dataset)),
    };
  });

  protected readonly options = computed<ChartConfiguration<'line'>['options']>(() => {
    const chart = this.chart();
    this.theme.theme();
    this.i18n.language();
    const textColor = this.cssColor('--semantic-chart-text', 'currentColor');
    const borderColor = this.cssColor('--semantic-chart-border', 'currentColor');
    const gridColor = this.cssColor('--semantic-chart-grid', 'transparent');
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
            color: textColor,
            font: { size: 9 },
          },
        },
        tooltip: {
          enabled: true,
          position: 'nearest',
          callbacks: {
            title: (items: TooltipItem<'line'>[]) =>
              items.length ? this.i18n.t('chart.timeTooltip', { value: items[0].label }) : '',
            label: (item: TooltipItem<'line'>) =>
              `${item.dataset.label}: ${item.formattedValue}${chart.valueSuffix}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: borderColor },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 7,
            color: textColor,
            font: { size: 9 },
            callback(value) {
              return `${this.getLabelForValue(Number(value))} min`;
            },
          },
          title: {
            display: true,
            text: this.i18n.t(chart.xAxisLabelKey),
            color: textColor,
            font: { size: 9, weight: 600 },
          },
        },
        y: {
          min: chart.yMin,
          max: chart.yMax,
          grid: { color: gridColor },
          border: { display: false },
          ticks: {
            color: textColor,
            font: { size: 9 },
            stepSize: chart.yStepSize,
            callback: (value) => `${value}${chart.valueSuffix}`,
          },
          title: {
            display: true,
            text: this.i18n.t(chart.yAxisLabelKey),
            color: textColor,
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
      label: this.i18n.t(dataset.labelKey),
      borderColor: this.cssColor(dataset.colorToken, 'currentColor'),
      fill: dataset.fill ?? false,
      pointRadius: dataset.pointRadius ?? 0,
      pointHoverRadius: dataset.pointHoverRadius ?? 4,
    };

    if (dataset.gradientColorTokens) {
      const colors = dataset.gradientColorTokens.map((token) => this.cssColor(token, 'currentColor')) as [string, string];
      prepared.borderColor = (context) => this.createVerticalGradient(context, colors);
    }

    delete (prepared as Partial<TelemetryChartDataset>).labelKey;
    delete (prepared as Partial<TelemetryChartDataset>).colorToken;
    delete (prepared as Partial<TelemetryChartDataset>).backgroundColorToken;
    delete (prepared as Partial<TelemetryChartDataset>).gradientColorTokens;
    return prepared;
  }

  protected title(): string {
    return this.i18n.t(this.chart().titleKey);
  }

  protected subtitle(): string {
    return this.i18n.t(this.chart().subtitleKey);
  }

  private cssColor(token: string, fallback: string): string {
    return getComputedStyle(this.document.documentElement).getPropertyValue(token).trim() || fallback;
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
