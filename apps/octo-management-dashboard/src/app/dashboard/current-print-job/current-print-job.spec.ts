import { TestBed } from '@angular/core/testing';
import { CurrentPrintJob } from './current-print-job';

describe('CurrentPrintJob', () => {
  it('renders an error as an error instead of a successful stopped state', () => {
    const fixture = TestBed.createComponent(CurrentPrintJob);
    fixture.componentRef.setInput('job', {
      name: 'Part',
      thumbnailUrl: '',
      thumbnailAlt: '',
      progress: 20,
      currentLayer: 2,
      totalLayers: 10,
      estimatedPrintTime: '10 min',
      status: 'error',
    });
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.job-card') as HTMLElement;
    expect(card.classList).toContain('job-card--error');
    expect(card.querySelector('.status')?.textContent).toContain('Błąd');
  });
});
