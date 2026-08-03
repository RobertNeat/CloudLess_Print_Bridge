import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PopoverModule } from 'primeng/popover';
import { SliderModule } from 'primeng/slider';
import type { PrintSpeedMode } from '../dashboard.models';
import { I18nService, type TranslationKey } from '../../core/i18n.service';

@Component({ selector: 'app-printer-quick-controls', imports: [FormsModule, PopoverModule, SliderModule], templateUrl: './printer-quick-controls.html', styleUrl: './printer-quick-controls.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class PrinterQuickControls {
  protected readonly i18n = inject(I18nService);
  readonly lightEnabled = model(false);
  readonly fansEnabled = model(false);
  readonly fanSpeed = model(0);
  readonly printSpeed = model<PrintSpeedMode>('standard');
  protected readonly speedModes: readonly PrintSpeedMode[] = ['silent', 'standard', 'sport', 'ludicrous'];
  private lastFanSpeed = 50;

  private readonly normalizeState = effect(() => {
    const speed = Math.round(Math.min(100, Math.max(0, Number(this.fanSpeed()) || 0)) / 10) * 10;
    if (speed !== this.fanSpeed()) this.fanSpeed.set(speed);
    if (speed === 0 && this.fansEnabled()) this.fansEnabled.set(false);
    if (speed > 0) this.lastFanSpeed = speed;
  });

  protected toggleLight(): void { this.lightEnabled.update((value) => !value); }
  protected toggleFans(): void {
    const next = !this.fansEnabled();
    this.fansEnabled.set(next);
    this.fanSpeed.set(next ? this.lastFanSpeed : 0);
  }
  protected setFanSpeed(value: number): void { this.fanSpeed.set(value); this.fansEnabled.set(value > 0); }
  protected speedLabel(mode: PrintSpeedMode): string {
    return this.i18n.t(`controls.speed.${mode}` as TranslationKey);
  }
}
