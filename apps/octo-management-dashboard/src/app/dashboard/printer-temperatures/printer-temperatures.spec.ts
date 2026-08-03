import { TestBed } from '@angular/core/testing';
import { PrinterTemperatures } from './printer-temperatures';

describe('PrinterTemperatures', () => {
  it('does not allow editing an inactive temperature sensor', () => {
    const fixture = TestBed.createComponent(PrinterTemperatures);
    fixture.componentRef.setInput('temperatures', { chamber: null, bed: 60, nozzle: 215 });
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.temperature') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
    expect(buttons[2].disabled).toBe(false);
  });
});
