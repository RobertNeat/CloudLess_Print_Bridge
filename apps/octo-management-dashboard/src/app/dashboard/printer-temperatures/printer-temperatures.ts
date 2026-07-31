import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PrinterTemperatureData } from '../dashboard.models';

@Component({ selector: 'app-printer-temperatures', templateUrl: './printer-temperatures.html', styleUrl: './printer-temperatures.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class PrinterTemperatures {
  readonly temperatures = input.required<PrinterTemperatureData>();
  protected readonly readings = computed(() => [
    { label: 'Komora', value: this.temperatures().chamber, icon: 'pi pi-box', color: 'blue' },
    { label: 'Stół', value: this.temperatures().bed, icon: 'pi pi-stop', color: 'orange' },
    { label: 'Dysza', value: this.temperatures().nozzle, icon: 'pi pi-map-marker', color: 'red' },
  ]);
}
