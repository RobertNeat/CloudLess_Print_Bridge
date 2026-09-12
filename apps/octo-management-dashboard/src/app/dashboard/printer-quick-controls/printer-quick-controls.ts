import { ChangeDetectionStrategy, Component, computed, effect, inject, model } from '@angular/core';
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
  /**
   * fanSpeed is the only authoritative fan control; fansEnabled is
   * never directly set by user code. Instead, it is always derived:
   * fansEnabled = (fanSpeed > 0). This eliminates duplicate commands
   * when the speed changes (no separate set(fansEnabled) emit), and
   * simplifies the parent's state tracking — only fanSpeed needs
   * suppression, not both. The toggle switches the speed between 0%
   * and lastFanSpeed to achieve on/off semantics at the command level.
   */
  readonly fanSpeed = model(0);
  /**
   * Derived read-only state: fans are on only if speed > 0. This has
   * no model() output binding; the parent reads it via the getter when
   * rendering, never subscribes to a *Change event for it.
   */
  readonly fansEnabled = computed(() => this.fanSpeed() > 0);
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
   * externally (e.g. from parent polling updates). This keeps the UI
   * always showing a valid step value, but is kept local — the
   * normalized value is never emitted back to the parent as a spurious
   * fanSpeedChange (the parent's optimistic patch and the polling
   * value are kept in sync by PollSuppressionWindow).
   */
  private readonly normalizeState = effect(() => {
    const speed = Math.round(Math.min(100, Math.max(0, Number(this.fanSpeed()) || 0)) / 10) * 10;
    if (speed !== this.fanSpeed()) this.fanSpeed.set(speed);
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
   * Sets the fan speed and updates lastFanSpeed cache if > 0. Emits
   * only fanSpeedChange, never a separate fansEnabledChange.
   */
  protected setFanSpeed(value: number): void {
    this.fanSpeed.set(value);
  }

  protected speedLabel(mode: PrintSpeedMode): string {
    return this.i18n.t(`controls.speed.${mode}` as TranslationKey);
  }
}
