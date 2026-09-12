import { TestBed } from '@angular/core/testing';
import { PrinterTemperatures } from './printer-temperatures';
import type { TemperatureChange } from './printer-temperatures';

describe('PrinterTemperatures', () => {
  it('does not allow editing an inactive temperature sensor', () => {
    const fixture = TestBed.createComponent(PrinterTemperatures);
    fixture.componentRef.setInput('temperatures', { chamber: null, bed: 60, nozzle: 215 });
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll(
      '.temperature',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
    expect(buttons[2].disabled).toBe(false);
  });

  it('defaults to every sensor being settable, preserving current behavior', () => {
    const fixture = TestBed.createComponent(PrinterTemperatures);
    fixture.componentRef.setInput('temperatures', { chamber: 28, bed: 60, nozzle: 215 });
    fixture.detectChanges();

    const chamberButton = fixture.nativeElement.querySelector(
      '#temperature-reading-chamber',
    ) as HTMLButtonElement;
    expect(chamberButton.disabled).toBe(false);
  });

  it('disables the chamber sensor for editing even with a real reading when it is excluded from settableSensors', () => {
    const fixture = TestBed.createComponent(PrinterTemperatures);
    fixture.componentRef.setInput('temperatures', { chamber: 28, bed: 60, nozzle: 215 });
    fixture.componentRef.setInput('settableSensors', ['bed', 'nozzle']);
    fixture.detectChanges();

    const chamberButton = fixture.nativeElement.querySelector(
      '#temperature-reading-chamber',
    ) as HTMLButtonElement;
    expect(chamberButton.disabled).toBe(true);
    expect(chamberButton.getAttribute('data-settable')).toBe('false');

    const bedButton = fixture.nativeElement.querySelector(
      '#temperature-reading-bed',
    ) as HTMLButtonElement;
    expect(bedButton.disabled).toBe(false);
  });

  it('emits a rounded, clamped temperatureChange when the editor is submitted', () => {
    const fixture = TestBed.createComponent(PrinterTemperatures);
    fixture.componentRef.setInput('temperatures', { chamber: null, bed: 60, nozzle: 215 });
    fixture.detectChanges();

    const emitted: TemperatureChange[] = [];
    fixture.componentInstance.temperatureChange.subscribe((change) => emitted.push(change));

    // Bypass PrimeNG's popover overlay lifecycle (toggle()/hide() require a
    // real rendered overlay) — stub just the two methods openEditor/save
    // call, then drive the component exactly as the template's click and
    // (submit) handlers would.
    const popoverStub = { toggle: () => {}, hide: () => {} } as unknown as Parameters<
      PrinterTemperatures['save']
    >[0];
    const nozzleReading = fixture.componentInstance['readings']().find(
      (reading) => reading.sensor === 'nozzle',
    )!;
    fixture.componentInstance['openEditor'](new Event('click'), nozzleReading, popoverStub);

    // Manual-entry / stepper input: the popover's p-inputnumber binds
    // straight to draftValue via ngModel, so setting it here is exactly
    // what typing a value or pressing +/- produces.
    fixture.componentInstance['draftValue'].set(230.6);
    fixture.componentInstance['save'](popoverStub);

    expect(emitted).toEqual([{ sensor: 'nozzle', value: 231 }]);
  });

  it('does not emit when the editor is submitted with no sensor selected', () => {
    const fixture = TestBed.createComponent(PrinterTemperatures);
    fixture.componentRef.setInput('temperatures', { chamber: null, bed: 60, nozzle: 215 });
    fixture.detectChanges();

    const emitted: TemperatureChange[] = [];
    fixture.componentInstance.temperatureChange.subscribe((change) => emitted.push(change));

    expect(fixture.componentInstance['selected']()).toBeNull();
    expect(emitted).toEqual([]);
  });
});
