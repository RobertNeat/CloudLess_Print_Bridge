import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { I18nService, type TranslationKey } from '../../core/i18n.service';
import type {
  CameraLocationCode,
  CameraMetric,
  CameraMetricCode,
  CameraMetricValueCode,
  CameraSource,
} from '../videos-dashboard.models';

const metricLabelKeys: Record<CameraMetricCode, TranslationKey> = {
  status: 'videos.metric.status',
  power: 'videos.metric.power',
  mode: 'videos.metric.mode',
  resolution: 'videos.metric.resolution',
  fps: 'videos.metric.fps',
  temperature: 'videos.metric.temperature',
  cameraIp: 'videos.metric.cameraIp',
  serviceIp: 'videos.metric.serviceIp',
};

const metricValueKeys: Record<CameraMetricValueCode, TranslationKey> = {
  stream: 'videos.metricValue.stream',
  enabled: 'videos.metricValue.enabled',
  ready: 'videos.metricValue.ready',
};

const locationKeys: Record<CameraLocationCode, TranslationKey> = {
  printerChamber: 'videos.location.printerChamber',
  buildPlate: 'videos.location.buildPlate',
  workshop: 'videos.location.workshop',
};

@Component({
  selector: 'app-camera-panel',
  imports: [ButtonModule],
  templateUrl: './camera-panel.html',
  styleUrl: './camera-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraPanel {
  protected readonly i18n = inject(I18nService);
  readonly metrics = input.required<readonly CameraMetric[]>();
  readonly sources = input.required<readonly CameraSource[]>();
  readonly selectedSourceId = input.required<string>();
  readonly streamActive = input.required<boolean>();
  readonly sourceSelected = output<string>();

  protected sourceLocation(source: CameraSource): string {
    return this.i18n.t(locationKeys[source.locationCode]);
  }

  protected sourceAriaLabel(source: CameraSource): string {
    return this.i18n.t('videos.sourceAria', {
      name: source.name,
      location: this.sourceLocation(source),
      status: this.i18n.t(`videos.source.${source.status}`),
    });
  }

  protected metricLabel(metric: CameraMetric): string {
    return this.i18n.t(metricLabelKeys[metric.code]);
  }

  protected metricValue(metric: CameraMetric): string {
    if (metric.valueCode) return this.i18n.t(metricValueKeys[metric.valueCode]);
    if (typeof metric.value === 'number') {
      const value = this.i18n.formatNumber(metric.value, 1);
      return metric.code === 'temperature' ? `${value} °C` : value;
    }
    return metric.value ?? '';
  }

  protected sourcesCount(): string {
    return this.i18n.plural(
      {
        one: 'videos.sourcesCount.one',
        few: 'videos.sourcesCount.few',
        many: 'videos.sourcesCount.many',
        other: 'videos.sourcesCount.other',
      },
      this.sources().length,
    );
  }

  protected streamStatusKey(): TranslationKey {
    const selected = this.sources().find((source) => source.id === this.selectedSourceId());
    if (selected?.status === 'offline') return 'videos.stream.offline';
    return this.streamActive() ? 'videos.stream.active' : 'videos.stream.ready';
  }
}
