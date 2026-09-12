import { TestBed } from '@angular/core/testing';
import { PrinterTemperatures } from './printer-temperatures';

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
});
