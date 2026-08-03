import { TestBed } from '@angular/core/testing';
import { FilesDashboardLayoutService } from './files-dashboard-layout.service';

describe('FilesDashboardLayoutService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('stores list width independently from details position', () => {
    const layout = TestBed.inject(FilesDashboardLayoutService);

    layout.setBrowserWidth('maximum');
    layout.setDetailsPosition('left');

    expect(layout.browserWidth()).toBe('maximum');
    expect(layout.detailsPosition()).toBe('left');
    layout.setBrowserWidth('wide');
    expect(layout.detailsPosition()).toBe('left');
  });

  it('resets both layout dimensions and removes persisted values', () => {
    const layout = TestBed.inject(FilesDashboardLayoutService);
    layout.setBrowserWidth('maximum');
    layout.setDetailsPosition('left');

    layout.reset();

    expect(layout.browserWidth()).toBe('standard');
    expect(layout.detailsPosition()).toBe('right');
    expect(localStorage.getItem('octo-files-browser-width-v2')).toBeNull();
    expect(localStorage.getItem('octo-files-details-position-v2')).toBeNull();
  });
});
