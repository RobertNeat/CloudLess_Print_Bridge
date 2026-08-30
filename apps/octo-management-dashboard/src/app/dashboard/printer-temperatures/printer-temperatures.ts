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
  readonly temperatureChange = output<TemperatureChange>();
  protected readonly selected = signal<TemperatureReading | null>(null);
  protected readonly draftValue = signal<number | null>(null);
  protected readonly readings = computed<TemperatureReading[]>(() => [
    {
      sensor: 'chamber',
      label: this.i18n.t('temperatures.chamber'),
      value: this.temperatures().chamber,
      icon: 'pi pi-box',
      color: 'info',
    },
    {
      sensor: 'bed',
      label: this.i18n.t('temperatures.bed'),
      value: this.temperatures().bed,
      icon: 'pi pi-stop',
      color: 'warning',
    },
    {
      sensor: 'nozzle',
      label: this.i18n.t('temperatures.nozzle'),
      value: this.temperatures().nozzle,
      icon: 'pi pi-map-marker',
      color: 'danger',
    },
  ]);

  protected openEditor(event: Event, reading: TemperatureReading, popover: Popover): void {
    if (reading.value === null) return;
    this.selected.set(reading);
    this.draftValue.set(reading.value);
    popover.toggle(event);
  }

  protected save(popover: Popover): void {
    const selected = this.selected();
    const value = this.draftValue();
    if (!selected || selected.value === null || value === null || !Number.isFinite(value)) return;
    this.temperatureChange.emit({
      sensor: selected.sensor,
      value: Math.round(Math.min(400, Math.max(0, value))),
    });
    popover.hide();
  }
}
