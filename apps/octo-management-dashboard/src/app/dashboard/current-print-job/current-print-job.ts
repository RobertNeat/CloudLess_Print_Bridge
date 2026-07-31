import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import type { CurrentPrintJobData } from '../dashboard.models';

@Component({
  selector: 'app-current-print-job',
  imports: [ButtonModule],
  templateUrl: './current-print-job.html',
  styleUrl: './current-print-job.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurrentPrintJob {
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
}
