import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { I18nService, type TranslationKey } from '../../core/i18n.service';
import type { CurrentPrintJobData } from '../dashboard.models';

@Component({
  selector: 'app-current-print-job',
  imports: [ButtonModule],
  templateUrl: './current-print-job.html',
  styleUrl: './current-print-job.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurrentPrintJob {
  protected readonly i18n = inject(I18nService);
  readonly job = input.required<CurrentPrintJobData>();
  readonly pauseRequested = output<void>();
  readonly resumeRequested = output<void>();
  readonly cancelRequested = output<void>();

  protected readonly progress = computed(() =>
    Math.round(Math.min(100, Math.max(0, this.job().progress))),
  );
  protected readonly layer = computed(() =>
    Math.min(Math.max(0, Math.trunc(this.job().currentLayer)), Math.max(0, this.job().totalLayers)),
  );
  protected readonly progressStyle = computed(() => ({ '--print-progress': `${this.progress()}%` }));
  protected readonly terminal = computed(() =>
    ['completed', 'cancelled', 'error'].includes(this.job().status),
  );
  protected readonly statusLabel = computed(() =>
    this.i18n.t(`printJob.status.${this.job().status}` as TranslationKey),
  );
}
