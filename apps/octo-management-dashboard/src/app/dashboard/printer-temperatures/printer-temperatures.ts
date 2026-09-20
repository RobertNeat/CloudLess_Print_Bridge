import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { Popover, PopoverModule } from 'primeng/popover';
import { I18nService } from '../../core/i18n.service';
import type { PrinterTemperatureData } from '../dashboard.models';

export type TemperatureSensor = keyof PrinterTemperatureData;

export interface TemperatureChange {
  readonly sensor: TemperatureSensor;
  readonly value: number;
}

interface TemperatureReading {
  readonly sensor: TemperatureSensor;
  readonly label: string;
  readonly value: number | null;
  /** User-set target temperature for this sensor; null when not yet set. */
  readonly target: number | null;
  readonly icon: string;
  readonly color: 'info' | 'warning' | 'danger';
}

@Component({
  selector: 'app-printer-temperatures',
  imports: [ButtonModule, FormsModule, InputNumberModule, PopoverModule],
  templateUrl: './printer-temperatures.html',
  styleUrl: './printer-temperatures.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrinterTemperatures {
  protected readonly i18n = inject(I18nService);
  readonly temperatures = input.required<PrinterTemperatureData>();
  /**
   * Sensors whose displayed value can be edited (a target temperature set
   * via the popover). Defaults to all three, preserving current/mock
   * behavior. DashboardPage instead passes settableTemperatureSensors(),
   * derived from the active printer profile's heaterCapabilities
   * (GET /device_config/profile) rather than a hardcoded literal — the real
   * Bambu Lab A1 has no chamber heater today, so the chamber reading stays
   * display-only, but a future profile that reports one becomes editable
   * here with zero changes to this component.
   */
  readonly settableSensors = input<readonly TemperatureSensor[]>(['chamber', 'bed', 'nozzle']);
  readonly temperatureChange = output<TemperatureChange>();
  protected readonly selected = signal<TemperatureReading | null>(null);
  protected readonly draftValue = signal<number | null>(null);
  /** User-set target temperatures, keyed by sensor; local UI state only. */
  protected readonly targets = signal<Record<TemperatureSensor, number | null>>({
    chamber: null,
    bed: null,
    nozzle: null,
  });
  protected readonly readings = computed<TemperatureReading[]>(() => {
    const targets = this.targets();
    return [
      {
        sensor: 'chamber',
        label: this.i18n.t('temperatures.chamber'),
        value: this.temperatures().chamber,
        target: targets.chamber,
        icon: 'pi pi-box',
        color: 'info',
      },
      {
        sensor: 'bed',
        label: this.i18n.t('temperatures.bed'),
        value: this.temperatures().bed,
        target: targets.bed,
        icon: 'pi pi-stop',
        color: 'warning',
      },
      {
        sensor: 'nozzle',
        label: this.i18n.t('temperatures.nozzle'),
        value: this.temperatures().nozzle,
        target: targets.nozzle,
        icon: 'pi pi-map-marker',
        color: 'danger',
      },
    ];
  });

  protected isSettable(sensor: TemperatureSensor): boolean {
    return this.settableSensors().includes(sensor);
  }

  /** Formats a temperature to 2 decimal places, or '—' when null. */
  protected formatTemperature(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(2)}°C`;
  }

  protected openEditor(event: Event, reading: TemperatureReading, popover: Popover): void {
    if (reading.value === null || !this.isSettable(reading.sensor)) return;
    this.selected.set(reading);
    this.draftValue.set(reading.target ?? reading.value);
    popover.toggle(event);
  }

  protected save(popover: Popover): void {
    const selected = this.selected();
    const value = this.draftValue();
    if (!selected || selected.value === null || value === null || !Number.isFinite(value)) return;
    const clamped = Math.round(Math.min(400, Math.max(0, value)));
    this.targets.update((targets) => ({ ...targets, [selected.sensor]: clamped }));
    this.temperatureChange.emit({
      sensor: selected.sensor,
      value: clamped,
    });
    popover.hide();
  }
}
