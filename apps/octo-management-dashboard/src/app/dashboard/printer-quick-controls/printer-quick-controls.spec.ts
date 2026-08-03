import { TestBed } from '@angular/core/testing';
import { PrinterQuickControls } from './printer-quick-controls';

describe('PrinterQuickControls', () => {
  it('represents lighting state only with the icon and accessible pressed state', () => {
    const fixture = TestBed.createComponent(PrinterQuickControls);
    fixture.componentRef.setInput('lightEnabled', false);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.control') as HTMLButtonElement;
    expect(button.textContent).toContain('Oświetlenie');
    expect(button.textContent).not.toContain('Wyłączone');
    expect(button.querySelector('.pi-power-off')).toBeTruthy();
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    fixture.detectChanges();
    expect(button.querySelector('.pi-lightbulb')).toBeTruthy();
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
