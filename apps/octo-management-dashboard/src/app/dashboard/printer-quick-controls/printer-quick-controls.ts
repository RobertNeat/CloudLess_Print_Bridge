import { ChangeDetectionStrategy, Component, effect, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PopoverModule } from 'primeng/popover';
import { SliderModule } from 'primeng/slider';
import type { PrintSpeedMode } from '../dashboard.models';
import { I18nService, type TranslationKey } from '../../core/i18n.service';

@Component({
  selector: 'app-printer-quick-controls',
  imports: [FormsModule, PopoverModule, SliderModule],
  templateUrl: './printer-quick-controls.html',
  styleUrl: './printer-quick-controls.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrinterQuickControls {
  protected readonly i18n = inject(I18nService);
  readonly lightEnabled = model(false);
  readonly fanSpeed = model(0);
  /**
   * One-way input(), not model(): the parent (dashboard-page.html) still
   * binds [fansEnabled]="data.controls.fansEnabled" to keep this in sync
   * with real backend state, but this component never writes it back —
   * doing so emits a redundant fansEnabledChange alongside fanSpeedChange
   * on every interaction, causing two racing /printer-controls/fan POSTs
   * per click. All fan on/off UI logic below reads this input directly;
   * toggleFans()/setFanSpeed() only ever emit fanSpeedChange, and the
   * parent derives the next fansEnabled from the new speed itself (see
   * DashboardPage.updateControl()).
   */
  readonly fansEnabled = input(false);
  readonly printSpeed = model<PrintSpeedMode>('standard');
  protected readonly speedModes: readonly PrintSpeedMode[] = [
    'silent',
    'standard',
    'sport',
    'ludicrous',
  ];
  private lastFanSpeed = 50;

  /**
   * Normalizes the fan speed to the nearest 10% when it is set
   * externally (e.g. from parent polling updates), and keeps the
   * "last running speed" cache used by toggleFans() up to date so
   * turning fans back on after an external speed change resumes at
   * that speed rather than a stale value from before this session.
   */
  private readonly normalizeState = effect(() => {
    const speed = Math.round(Math.min(100, Math.max(0, Number(this.fanSpeed()) || 0)) / 10) * 10;
    if (speed !== this.fanSpeed()) this.fanSpeed.set(speed);
    if (speed > 0) this.lastFanSpeed = speed;
  });

  protected toggleLight(): void {
    this.lightEnabled.update((value) => !value);
  }

  /**
   * Toggles between running at lastFanSpeed and stopped (0%). Does not
   * emit fansEnabledChange because fansEnabled is no longer a model().
   * Only fanSpeedChange is emitted, which the parent maps to a single
   * /printer-controls/fan command.
   */
  protected toggleFans(): void {
    const currentSpeed = this.fanSpeed();
    this.fanSpeed.set(currentSpeed > 0 ? 0 : this.lastFanSpeed);
  }

  /**
   * Emits only fanSpeedChange — never a separate fansEnabledChange, since
   * fansEnabled is a one-way input the parent derives itself.
   */
  protected setFanSpeed(value: number): void {
    this.fanSpeed.set(value);
  }

  protected speedLabel(mode: PrintSpeedMode): string {
    return this.i18n.t(`controls.speed.${mode}` as TranslationKey);
  }
}
